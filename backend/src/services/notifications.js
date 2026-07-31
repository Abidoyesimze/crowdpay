const db = require('../config/database');
const logger = require('../config/logger');
const channels = require('./notificationChannels');
const fcmPush = require('./fcmPushService');

// Multi-channel notification orchestration (issue #429).
//
// `createNotification` remains the single entry point used across the codebase.
// It always writes the in-app notification (preserving existing behaviour) and
// additionally fans the message out to any external channels the user has
// configured and enabled. Non-critical notifications that arrive during a
// user's quiet hours are parked in `notification_queue` and flushed later as a
// digest by `flushQuietHours`.

// Persist the in-app notification row. This is the baseline channel and is
// always delivered.
async function insertInApp(userId, { type, title, body, link }) {
  await db.query(
    `INSERT INTO notifications (user_id, type, title, body, link)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, type, title, body || null, link || null]
  );
}

async function loadChannelSettings(userId) {
  const { rows } = await db.query(
    `SELECT push_token, slack_webhook_url, discord_webhook_url, sms_phone_number,
            quiet_hours_start, quiet_hours_end,
            EXISTS (SELECT 1 FROM push_subscriptions WHERE user_id = $1) AS push_enabled
     FROM notification_channel_settings
     WHERE user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

// Per-event-type channel overrides. Returns a map channel -> enabled.
async function loadPreferences(userId, eventType) {
  const { rows } = await db.query(
    `SELECT channel, enabled
     FROM notification_preferences
     WHERE user_id = $1 AND event_type = $2`,
    [userId, eventType]
  );
  const map = {};
  for (const r of rows) map[r.channel] = r.enabled;
  return map;
}

// Whether an external channel should receive this event. A channel is on when
// it has a destination configured and the user has not explicitly disabled it
// for this event type.
function channelEnabled(channel, prefs, settings) {
  if (channel === 'push' && settings?.push_enabled) {
    return prefs.push === undefined ? true : prefs.push === true;
  }
  if (!channels.destinationFor(channel, settings)) return false;
  const override = prefs[channel];
  return override === undefined ? true : override === true;
}

async function deliverChannel(userId, channel, settings, message) {
  if (channel === 'push' && settings.push_enabled) {
    try {
      return await fcmPush.sendToUser(userId, message);
    } catch (err) {
      logger.error('FCM notification delivery failed', { user_id: userId, type: message.type, error: err.message });
      return false;
    }
  }
  return channels.deliver(channel, settings, message);
}

// Determine whether `nowHour` (0-23) falls inside the user's quiet-hours
// window. Supports windows that wrap past midnight (start=22, end=7).
function inQuietHours(settings, nowHour) {
  if (!settings) return false;
  const start = settings.quiet_hours_start;
  const end = settings.quiet_hours_end;
  if (start === null || start === undefined || end === null || end === undefined) return false;
  if (start === end) return false;
  if (start < end) return nowHour >= start && nowHour < end;
  // Wrapping window: e.g. 22:00 -> 07:00.
  return nowHour >= start || nowHour < end;
}

async function queueForDigest(userId, channel, message) {
  await db.query(
    `INSERT INTO notification_queue (user_id, channel, type, title, body, link)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, channel, message.type, message.title, message.body || null, message.link || null]
  );
}

/**
 * Create a notification for a user and fan it out across every enabled channel.
 *
 * Always writes the in-app notification. External channels (push, Slack,
 * Discord, SMS) are delivered when the user has configured a destination and
 * not disabled the channel for this event type. Non-critical events that land
 * during quiet hours are queued for a later digest instead of delivered
 * immediately; critical events (deadlines, withdrawal decisions) always go out
 * right away.
 *
 * @param {number} [nowHour] Current local hour (0-23); injectable for testing.
 */
async function createNotification(userId, { type, title, body, link }, { nowHour } = {}) {
  const message = { type, title, body, link };
  try {
    await insertInApp(userId, message);
  } catch (err) {
    logger.error('Failed to create notification', { user_id: userId, type, error: err.message });
    // In-app is the baseline record; if it fails we still attempt external
    // channels below so a transient DB error doesn't silently drop alerts.
  }

  let settings;
  let prefs;
  try {
    [settings, prefs] = await Promise.all([
      loadChannelSettings(userId),
      loadPreferences(userId, type),
    ]);
  } catch (err) {
    logger.error('Failed to load notification settings', { user_id: userId, type, error: err.message });
    return;
  }

  if (!settings) return; // No external channels configured.

  const externalChannels = channels.CHANNELS.filter((c) => c !== 'in_app');
  const critical = channels.isCriticalEvent(type);
  const currentHour = typeof nowHour === 'number' ? nowHour : new Date().getHours();
  const quiet = !critical && inQuietHours(settings, currentHour);

  for (const channel of externalChannels) {
    if (!channelEnabled(channel, prefs, settings)) continue;

    if (quiet) {
      try {
        await queueForDigest(userId, channel, message);
      } catch (err) {
        logger.error('Failed to queue notification for digest', {
          user_id: userId, channel, type, error: err.message,
        });
      }
      continue;
    }

    await deliverChannel(userId, channel, settings, message);
  }
}

/**
 * Flush notifications parked during quiet hours. For each user/channel with
 * pending items, delivers a single digest message summarising them and marks
 * the rows flushed. Intended to be run on a schedule (e.g. hourly cron).
 *
 * @param {number} [nowHour] Current local hour (0-23); injectable for testing.
 * @returns {Promise<number>} number of users flushed
 */
async function flushQuietHours({ nowHour } = {}) {
  const currentHour = typeof nowHour === 'number' ? nowHour : new Date().getHours();

  const { rows: pending } = await db.query(
    `SELECT q.id, q.user_id, q.channel, q.type, q.title, q.body, q.link,
            s.push_token, s.slack_webhook_url, s.discord_webhook_url, s.sms_phone_number,
            s.quiet_hours_start, s.quiet_hours_end
     FROM notification_queue q
     JOIN notification_channel_settings s ON s.user_id = q.user_id
     WHERE q.flushed_at IS NULL
     ORDER BY q.user_id, q.channel, q.created_at ASC`
  );

  // Group pending items by user+channel, skipping users still in quiet hours.
  const groups = new Map();
  for (const row of pending) {
    if (inQuietHours(row, currentHour)) continue;
    const key = `${row.user_id}:${row.channel}`;
    if (!groups.has(key)) {
      groups.set(key, { settings: row, channel: row.channel, items: [] });
    }
    groups.get(key).items.push(row);
  }

  const flushedUsers = new Set();
  for (const { settings, channel, items } of groups.values()) {
    const digest = {
      type: 'digest',
      title: `You have ${items.length} new notification${items.length === 1 ? '' : 's'}`,
      body: items.map((i) => i.title).join('\n'),
      link: null,
    };

    const delivered = await deliverChannel(settings.user_id, channel, settings, digest);
    if (delivered) {
      const ids = items.map((i) => i.id);
      await db.query(
        `UPDATE notification_queue SET flushed_at = NOW() WHERE id = ANY($1::uuid[])`,
        [ids]
      );
      flushedUsers.add(settings.user_id);
    }
  }

  return flushedUsers.size;
}

/**
 * Create in-app notifications for multiple users in a single multi-row INSERT.
 */
async function insertInAppBulk(userIds, { type, title, body, link }) {
  if (!userIds.length) return;
  const placeholders = userIds.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`);
  const values = userIds.flatMap((uid) => [uid, type, title, body || null, link || null]);
  await db.query(
    `INSERT INTO notifications (user_id, type, title, body, link) VALUES ${placeholders.join(', ')}`,
    values
  );
}

/**
 * Bulk-load channel settings for many users at once.
 */
async function loadChannelSettingsBulk(userIds) {
  if (!userIds.length) return new Map();
  const { rows } = await db.query(
    `SELECT user_id, push_token, slack_webhook_url, discord_webhook_url, sms_phone_number,
            quiet_hours_start, quiet_hours_end,
            EXISTS (SELECT 1 FROM push_subscriptions WHERE user_id = notification_channel_settings.user_id) AS push_enabled
     FROM notification_channel_settings
     WHERE user_id = ANY($1::uuid[])`,
    [userIds]
  );
  const map = new Map();
  for (const r of rows) map.set(r.user_id, r);
  return map;
}

/**
 * Bulk-load notification preferences for many users and a single event type.
 * Returns Map<user_id, Map<channel, enabled>>.
 */
async function loadPreferencesBulk(userIds, eventType) {
  if (!userIds.length) return new Map();
  const { rows } = await db.query(
    `SELECT user_id, channel, enabled
     FROM notification_preferences
     WHERE user_id = ANY($1::uuid[]) AND event_type = $2`,
    [userIds, eventType]
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.user_id)) map.set(r.user_id, {});
    map.get(r.user_id)[r.channel] = r.enabled;
  }
  return map;
}

/**
 * Queue multiple digest entries in a single multi-row INSERT.
 */
async function queueForDigestBulk(userChannelEntries, message) {
  if (!userChannelEntries.length) return;
  const placeholders = userChannelEntries.map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`);
  const values = userChannelEntries.flatMap(({ userId, channel }) =>
    [userId, channel, message.type, message.title, message.body || null, message.link || null]
  );
  await db.query(
    `INSERT INTO notification_queue (user_id, channel, type, title, body, link) VALUES ${placeholders.join(', ')}`,
    values
  );
}

/**
 * Fan out a notification to many users, batching DB operations and limiting
 * external channel delivery concurrency to avoid connection-pool exhaustion.
 *
 * @param {string[]} userIds
 * @param {{type, title, body?, link?}} message
 * @param {object} [opts]
 * @param {number} [opts.concurrency=10]  Max concurrent external deliveries
 * @param {number} [opts.nowHour]         Injectable for testing
 */
async function createNotificationsBulk(userIds, message, { concurrency = 10, nowHour } = {}) {
  if (!userIds.length) return;

  // 1. Batch in-app notification inserts
  try {
    await insertInAppBulk(userIds, message);
  } catch (err) {
    logger.error('Failed to bulk-create in-app notifications', { type: message.type, count: userIds.length, error: err.message });
  }

  // 2. Bulk-load settings and preferences
  let settingsMap;
  let prefsMap;
  try {
    [settingsMap, prefsMap] = await Promise.all([
      loadChannelSettingsBulk(userIds),
      loadPreferencesBulk(userIds, message.type),
    ]);
  } catch (err) {
    logger.error('Failed to bulk-load notification settings', { type: message.type, count: userIds.length, error: err.message });
    return;
  }

  // 3. Partition users by what to do
  const critical = channels.isCriticalEvent(message.type);
  const currentHour = typeof nowHour === 'number' ? nowHour : new Date().getHours();
  const externalChannels = channels.CHANNELS.filter((c) => c !== 'in_app');
  const toDeliver = [];
  const toQueue = [];

  for (const userId of userIds) {
    const settings = settingsMap.get(userId);
    if (!settings) continue;

    const prefs = prefsMap.get(userId) || {};
    const quiet = !critical && inQuietHours(settings, currentHour);

    for (const channel of externalChannels) {
      if (!channelEnabled(channel, prefs, settings)) continue;
      if (quiet) {
        toQueue.push({ userId, channel });
      } else {
        toDeliver.push({ userId, channel, settings });
      }
    }
  }

  // 4. Batch queue digest entries
  if (toQueue.length) {
    try {
      await queueForDigestBulk(toQueue, message);
    } catch (err) {
      logger.error('Failed to bulk-queue notifications for digest', { type: message.type, count: toQueue.length, error: err.message });
    }
  }

  // 5. Deliver external channels with bounded concurrency
  if (toDeliver.length) {
    const results = await asyncPool(concurrency, toDeliver, async ({ userId, channel, settings }) => {
      try {
        await deliverChannel(userId, channel, settings, message);
      } catch (err) {
        logger.error('Bulk notification delivery failed', { user_id: userId, channel, type: message.type, error: err.message });
      }
    });
  }
}

/**
 * Simple async pool — run an async function over items with bounded concurrency.
 */
async function asyncPool(concurrency, items, fn) {
  const results = [];
  const executing = new Set();
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item)).then((r) => {
      executing.delete(p);
      return r;
    });
    executing.add(p);
    results.push(p);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

module.exports = {
  createNotification,
  createNotificationsBulk,
  flushQuietHours,
  // exported for testing / reuse
  inQuietHours,
  channelEnabled,
};
