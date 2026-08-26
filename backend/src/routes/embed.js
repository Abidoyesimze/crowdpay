'use strict';

// backend/src/routes/embed.js
//
// Issue #690 — embeddable discovery widget API.
// Mount in src/index.js:
//   app.use('/api/embed', require('./routes/embed'));

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const db = require('../config/database');
const logger = require('../config/logger');
const asyncHandler = require('../utils/asyncHandler');
const { requireEmbedToken } = require('../middleware/embedAuth');
const { getTrendingCampaigns } = require('../services/trendingService');

const isTest = process.env.NODE_ENV === 'test';

// 100 requests / hour / embed token, per the issue's acceptance criteria.
const embedRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isTest ? 100000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.embedToken?.id || req.ip,
  message: { error: 'Embed rate limit exceeded (100 requests/hour per token).' },
});

const DESCRIPTION_TRUNCATE_LENGTH = 140;

function truncateDescription(description) {
  if (!description) return '';
  return description.length > DESCRIPTION_TRUNCATE_LENGTH
    ? `${description.slice(0, DESCRIPTION_TRUNCATE_LENGTH).trim()}...`
    : description;
}

function daysRemaining(deadline) {
  if (!deadline) return null;
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : 0;
}

function toWidgetCard(row, siteBaseUrl) {
  const goal = Number(row.target_amount) || 0;
  const raised = Number(row.raised_amount) || 0;
  return {
    id: row.id,
    title: row.title,
    description_truncated: truncateDescription(row.description),
    goalAmountUsd: goal,
    totalRaisedUsd: raised,
    percentFunded: goal > 0 ? Math.min(100, Math.round((raised / goal) * 1000) / 10) : 0,
    daysRemaining: daysRemaining(row.deadline),
    asset: row.asset_type,
    status: row.status,
    shareUrl: `${siteBaseUrl}/campaigns/${row.id}`,
  };
}

// GET /api/embed/discover?topic=<topic>&asset=<asset>&limit=<n>&embedToken=<token>
//
// Public endpoint (CORS-open, like the existing /:id/embed and /:id/widget
// routes) but gated by a per-creator embed token and rate limited.
router.get(
  '/discover',
  requireEmbedToken,
  embedRateLimiter,
  asyncHandler(async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    const { topic, asset } = req.query;
    const limit = Math.min(Math.max(Number(req.query.limit) || 3, 1), 5);
    const siteBaseUrl = (process.env.PUBLIC_SITE_URL || 'https://crowdpay.com').replace(/\/+$/, '');

    let rows;
    if (topic) {
      const params = [topic];
      const filters = [
        `c.deleted_at IS NULL`,
        `c.is_hidden = FALSE`,
        `c.is_flagged_duplicate = FALSE`,
        `c.status = 'active'`,
        `c.search_vector @@ websearch_to_tsquery('english', $1)`,
      ];
      if (asset) {
        params.push(asset);
        filters.push(`c.asset_type = $${params.length}`);
      }
      params.push(limit);

      const start = Date.now();
      const result = await db.query(
        `SELECT c.id, c.title, c.description, c.asset_type, c.target_amount,
                c.raised_amount, c.status, c.deadline
         FROM campaigns c
         WHERE ${filters.join(' AND ')}
         ORDER BY ts_rank_cd(c.search_vector, websearch_to_tsquery('english', $1)) DESC,
                  c.trending_score DESC
         LIMIT $${params.length}`,
        params
      );
      const elapsedMs = Date.now() - start;
      if (elapsedMs > 200) {
        logger.warn('Slow embed discovery search query', { elapsedMs, topic, asset });
      }
      rows = result.rows;
    } else {
      // No topic filter -> surface trending campaigns, optionally asset-filtered.
      const trending = await getTrendingCampaigns({ limit: 50 });
      rows = (asset ? trending.filter((c) => c.asset_type === asset) : trending).slice(0, limit);
    }

    res.json({ campaigns: rows.map((row) => toWidgetCard(row, siteBaseUrl)) });
  })
);

module.exports = router;