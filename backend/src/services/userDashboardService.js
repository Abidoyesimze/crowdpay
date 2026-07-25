'use strict';

const db = require('../config/database');
const { TtlCache } = require('../utils/TtlCache');

// Cache per-user dashboard data for 60 seconds.
// Key scheme: "campaigns:<userId>" and "contributions:<userId>"
const dashboardCache = new TtlCache(60_000);

async function listCreatorCampaigns(userId) {
  const key = `campaigns:${userId}`;
  return dashboardCache.wrap(key, async () => {
    const { rows } = await db.query(
      `SELECT c.id, c.title, c.status, c.asset_type, c.target_amount, c.raised_amount,
              c.deadline, c.created_at,
              COALESCE(stats.contributor_count, 0) AS contributor_count,
              EXISTS (
                SELECT 1 FROM milestones m WHERE m.campaign_id = c.id LIMIT 1
              ) AS has_milestones
       FROM campaigns c
       LEFT JOIN LATERAL (
         SELECT COUNT(DISTINCT sender_public_key)::int AS contributor_count
         FROM contributions ctr
         WHERE ctr.campaign_id = c.id
       ) stats ON TRUE
       WHERE c.creator_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );
    return rows;
  });
}

async function listUserContributions(userId) {
  const key = `contributions:${userId}`;
  return dashboardCache.wrap(key, async () => {
    const { rows: userRows } = await db.query(
      'SELECT wallet_public_key FROM users WHERE id = $1',
      [userId]
    );
    if (!userRows.length) return null;

    const senderPublicKey = userRows[0].wallet_public_key;
    const { rows } = await db.query(
      `SELECT ctr.id, ctr.amount, ctr.asset, ctr.anchor_id, ctr.anchor_transaction_id,
              ctr.source_amount, ctr.source_asset, ctr.conversion_rate, ctr.payment_type,
              ctr.tx_hash, ctr.created_at,
              c.id AS campaign_id, c.title AS campaign_title, c.status AS campaign_status,
              c.target_amount, c.raised_amount
       FROM contributions ctr
       JOIN campaigns c ON c.id = ctr.campaign_id
       WHERE ctr.sender_public_key = $1
       ORDER BY ctr.created_at DESC`,
      [senderPublicKey]
    );
    return rows;
  });
}

/**
 * Invalidate all cached dashboard data for a given user.
 * Call this after a contribution is made or a campaign status changes.
 * @param {string} userId
 */
function invalidateUserDashboard(userId) {
  dashboardCache.invalidatePrefix(`campaigns:${userId}`);
  dashboardCache.invalidatePrefix(`contributions:${userId}`);
}

module.exports = {
  listCreatorCampaigns,
  listUserContributions,
  invalidateUserDashboard,
  // Exported for testing
  _dashboardCache: dashboardCache,
};
