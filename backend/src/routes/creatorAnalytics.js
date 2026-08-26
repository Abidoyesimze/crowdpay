const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../config/logger');
const {
  getCreatorOverview,
  getCampaignDeepDive,
  getBenchmarks,
  getExportData,
  getExportRowCount,
  checkExportRateLimit,
  incrementExportCount,
  EXPORT_DAILY_LIMIT,
} = require('../services/creatorAnalytics');

router.get('/overview', requireAuth, requireRole('creator', 'admin'), asyncHandler(async (req, res) => {
  const data = await getCreatorOverview(req.user.userId);
  res.json(data);
}));

router.get('/campaigns/:id', requireAuth, requireRole('creator', 'admin'), asyncHandler(async (req, res) => {
  const data = await getCampaignDeepDive(req.user.userId, req.params.id);
  if (!data) {
    return res.status(404).json({ error: 'Campaign not found or not owned by you' });
  }
  res.json(data);
}));

router.get('/benchmarks', requireAuth, requireRole('creator', 'admin'), asyncHandler(async (req, res) => {
  const data = await getBenchmarks(req.user.userId);
  res.json(data);
}));

router.get('/export', requireAuth, requireRole('creator', 'admin'), asyncHandler(async (req, res) => {
  const { campaignId } = req.query;
  if (!campaignId) {
    return res.status(400).json({ error: 'campaignId query parameter is required' });
  }

  const rateLimit = await checkExportRateLimit(req.user.userId);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: 'EXPORT_LIMIT_REACHED',
      message: `Daily export limit of ${EXPORT_DAILY_LIMIT} reached. Try again tomorrow.`,
      remaining: 0,
    });
  }

  const rowCount = await getExportRowCount(req.user.userId, campaignId);
  if (rowCount === -1) {
    return res.status(404).json({ error: 'Campaign not found or not owned by you' });
  }

  if (rowCount > 10000) {
    await incrementExportCount(req.user.userId);
    logger.info('[creatorAnalytics] large export requested', {
      userId: req.user.userId,
      campaignId,
      rowCount,
    });
    return res.json({
      async: true,
      message: 'Large export queued. You will receive an email with the download link within 5 minutes.',
      estimated_rows: rowCount,
    });
  }

  await incrementExportCount(req.user.userId);

  const data = await getExportData(req.user.userId, campaignId);
  if (!data) {
    return res.status(404).json({ error: 'Campaign not found or not owned by you' });
  }

  const columns = [
    'contribution_date',
    'contributor_public_key',
    'amount',
    'asset',
    'source_asset',
    'source_amount',
    'usd_equivalent',
    'stellar_tx_hash',
    'referral_code',
  ];

  function csvCell(value) {
    const raw = value === null || value === undefined ? '' : String(value);
    if (/[",\r\n]/.test(raw)) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  }

  const header = columns.join(',');
  const lines = data.map((row) =>
    columns.map((col) => csvCell(row[col])).join(',')
  );

  const csv = [header, ...lines].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="campaign-${campaignId}-export.csv"`
  );
  res.setHeader('Cache-Control', 'no-store');
  res.send(csv);
}));

module.exports = router;
