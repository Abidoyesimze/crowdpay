'use strict';

/**
 * recurringContributionsService.js
 *
 * Cron job that fires every hour, finds active recurring contributions
 * whose next_run_at has passed, and creates the corresponding contribution
 * records while advancing next_run_at.
 *
 * No payment processing is wired here — the actual Stellar transaction
 * is enqueued via the same flow as a manual contribution so it benefits
 * from all existing retries and error handling.
 */

const db = require('../config/database');
const logger = require('../config/logger');

const CRON_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let _timer = null;

async function processRecurringContributions() {
  logger.info('recurring-contributions: checking due schedules');

  const { rows } = await db.query(
    `SELECT rc.id, rc.user_id, rc.campaign_id, rc.amount, rc.interval
     FROM recurring_contributions rc
     JOIN campaigns c ON c.id = rc.campaign_id
     WHERE rc.active = TRUE
       AND rc.next_run_at <= NOW()
       AND c.status = 'active'
       AND c.deleted_at IS NULL
     LIMIT 200`,
    []
  );

  if (!rows.length) {
    logger.debug('recurring-contributions: nothing due');
    return;
  }

  logger.info('recurring-contributions: processing', { count: rows.length });

  for (const schedule of rows) {
    try {
      await db.query('BEGIN');

      // Record the scheduled contribution
      await db.query(
        `INSERT INTO contributions
           (campaign_id, sender_public_key, amount, payment_type, asset, memo, is_recurring, recurring_id)
         SELECT $1, u.wallet_public_key, $2, 'scheduled', c.asset_type,
                'recurring-' || $3::text, TRUE, $3
         FROM users u, campaigns c
         WHERE u.id = $4 AND c.id = $1`,
        [schedule.campaign_id, schedule.amount, schedule.id, schedule.user_id]
      );

      // Advance next_run_at
      const next = schedule.interval === 'weekly'
        ? `next_run_at + INTERVAL '7 days'`
        : `(next_run_at + INTERVAL '1 month')`;

      await db.query(
        `UPDATE recurring_contributions
         SET last_run_at = NOW(),
             next_run_at = ${next},
             run_count   = run_count + 1,
             updated_at  = NOW()
         WHERE id = $1`,
        [schedule.id]
      );

      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK').catch(() => {});
      logger.error('recurring-contributions: failed to process schedule', {
        schedule_id: schedule.id,
        error: err.message,
      });
    }
  }

  logger.info('recurring-contributions: done', { processed: rows.length });
}

function startRecurringContributionsCron() {
  processRecurringContributions().catch((err) =>
    logger.error('recurring-contributions: initial run failed', { error: err.message })
  );
  _timer = setInterval(() => {
    processRecurringContributions().catch((err) =>
      logger.error('recurring-contributions: cron failed', { error: err.message })
    );
  }, CRON_INTERVAL_MS);
  logger.info('recurring-contributions: cron started', { interval_ms: CRON_INTERVAL_MS });
}

function stopRecurringContributionsCron() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { startRecurringContributionsCron, stopRecurringContributionsCron };
