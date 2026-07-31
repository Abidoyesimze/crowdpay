const router = require('express').Router();
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { getUserNftRewards, getCampaignNftRewards, listNftRewardsForContribution } = require('../services/nftRewardService');

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const rewards = await getUserNftRewards(req.user.userId);
  res.json({ rewards });
}));

router.get('/campaign/:campaignId', asyncHandler(async (req, res) => {
  const rewards = await getCampaignNftRewards(req.params.campaignId);
  res.json({ rewards });
}));

router.get('/contributions/:contributionId', requireAuth, asyncHandler(async (req, res) => {
  const { rows: contributionRows } = await db.query(
    `SELECT id FROM contributions WHERE id = $1`,
    [req.params.contributionId],
  );
  if (!contributionRows.length) return res.status(404).json({ error: 'Contribution not found' });
  const rewards = await listNftRewardsForContribution(req.params.contributionId);
  res.json({ rewards });
}));

module.exports = router;
