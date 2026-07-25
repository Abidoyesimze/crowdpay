'use strict';

/**
 * analyticsService.js
 *
 * Provides campaign analytics data. All query results are cached for 5 minutes
 * since analytics data changes infrequently and these 4 queries are expensive
 * (aggregations over contributions, campaigns, and milestones).
 *
 * Cache key scheme: "analytics:<campaignId>"
 * Invalidation: call invalidateCampaignAnalytics(campaignId) after a
 *               contribution is recorded or a milestone is released.
 */

const db = require('../config/database');
const { TtlCache } = require('../utils/TtlCache');

// 5-minute TTL — analytics snapshots don't need sub-minute freshness
const analyticsCache = new TtlCache(5 * 60_000);

/**
 * Get analytics for a single campaign.
 *
 * Runs 4 parallel queries:
 *   1. Contribution totals and unique backer count
 *   2. Daily contribution time series (last 30 days)
 *   3. Milestone release summary
 *   4. Asset / payment-type breakdown
 *
 * @param {string} campaignId
 * @returns {Promise<object>}
 */
async function getCampaignAnalytics(campaignId) {
  const key = `analytics:${campaignId}`;
  return analyticsCache.wrap(key, async () => {
    const [totals, timeSeries, milestones, breakdown] = await Promise.all([
      // 1. Totals + unique backers
      db.query(
        `SELECT
           COUNT(*)::int                        AS total_contributions,
           COUNT(DISTINCT sender_public_key)::int AS unique_backers,
           COALESCE(SUM(amount), 0)             AS total_received,
           COALESCE(AVG(amount), 0)             AS average_contribution,
           COALESCE(MAX(amount), 0)             AS largest_contribution
         FROM contributions
         WHERE campaign_id = $1`,
        [campaignId]
      ),

      // 2. Daily time series — last 30 days
      db.query(
        `SELECT
           date_trunc('day', created_at)::date AS day,
           COUNT(*)::int                        AS count,
           COALESCE(SUM(amount), 0)             AS amount
         FROM contributions
         WHERE campaign_id = $1
           AND created_at >= NOW() - INTERVAL '30 days'
         GROUP BY 1
         ORDER BY 1`,
        [campaignId]
      ),

      // 3. Milestone release progress
      db.query(
        `SELECT
           status,
           COUNT(*)::int            AS count,
           SUM(release_percentage)  AS total_release_pct
         FROM milestones
         WHERE campaign_id = $1
         GROUP BY status`,
        [campaignId]
      ),

      // 4. Payment type and asset breakdown
      db.query(
        `SELECT
           asset,
           payment_type,
           COUNT(*)::int       AS count,
           SUM(amount)         AS total
         FROM contributions
         WHERE campaign_id = $1
         GROUP BY asset, payment_type
         ORDER BY total DESC`,
        [campaignId]
      ),
    ]);

    return {
      campaign_id: campaignId,
      totals: totals.rows[0],
      daily_series: timeSeries.rows,
      milestones: milestones.rows,
      payment_breakdown: breakdown.rows,
      generated_at: new Date().toISOString(),
    };
  });
}

/**
 * Get platform-wide analytics summary.
 * Cached for 5 minutes — this is a heavy aggregation across all campaigns.
 *
 * @returns {Promise<object>}
 */
async function getPlatformAnalytics() {
  return analyticsCache.wrap('analytics:platform', async () => {
    const [summary, topCampaigns, recentActivity, assetBreakdown] = await Promise.all([
      // 1. Platform-wide totals
      db.query(
        `SELECT
           COUNT(DISTINCT c.id)::int            AS total_campaigns,
           COUNT(DISTINCT ctr.id)::int          AS total_contributions,
           COUNT(DISTINCT ctr.sender_public_key)::int AS unique_backers,
           COALESCE(SUM(ctr.amount), 0)         AS total_raised
         FROM campaigns c
         LEFT JOIN contributions ctr ON ctr.campaign_id = c.id
         WHERE c.deleted_at IS NULL`
      ),

      // 2. Top 5 campaigns by raised_amount
      db.query(
        `SELECT id, title, raised_amount, target_amount, asset_type, status
         FROM campaigns
         WHERE deleted_at IS NULL
         ORDER BY raised_amount DESC
         LIMIT 5`
      ),

      // 3. Contributions in last 24h
      db.query(
        `SELECT
           COUNT(*)::int        AS contributions_24h,
           COALESCE(SUM(amount), 0) AS raised_24h
         FROM contributions
         WHERE created_at >= NOW() - INTERVAL '24 hours'`
      ),

      // 4. Asset breakdown across all campaigns
      db.query(
        `SELECT asset, COUNT(*)::int AS count, SUM(amount) AS total
         FROM contributions
         GROUP BY asset
         ORDER BY total DESC`
      ),
    ]);

    return {
      summary: summary.rows[0],
      top_campaigns: topCampaigns.rows,
      recent_activity: recentActivity.rows[0],
      asset_breakdown: assetBreakdown.rows,
      generated_at: new Date().toISOString(),
    };
  });
}

/**
 * Invalidate cached analytics for a specific campaign.
 * Call after a contribution is recorded for that campaign.
 * @param {string} campaignId
 */
function invalidateCampaignAnalytics(campaignId) {
  analyticsCache.invalidate(`analytics:${campaignId}`);
  analyticsCache.invalidate('analytics:platform');
}

module.exports = {
  getCampaignAnalytics,
  getPlatformAnalytics,
  invalidateCampaignAnalytics,
  // Exported for testing
  _analyticsCache: analyticsCache,
};
