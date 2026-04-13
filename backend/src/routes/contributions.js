const router = require('express').Router();
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { submitPayment, submitPathPayment } = require('../services/stellarService');

// Get contributions for a campaign
router.get('/campaign/:campaignId', async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, sender_public_key, amount, asset, tx_hash, created_at
     FROM contributions WHERE campaign_id = $1 ORDER BY created_at DESC`,
    [req.params.campaignId]
  );
  res.json(rows);
});

// Contribute to a campaign (authenticated, custodial)
router.post('/', requireAuth, async (req, res) => {
  const { campaign_id, amount, send_asset } = req.body;
  if (!campaign_id || !amount || !send_asset) {
    return res.status(400).json({ error: 'campaign_id, amount and send_asset are required' });
  }

  // Load campaign
  const { rows: campaigns } = await db.query(
    'SELECT * FROM campaigns WHERE id = $1 AND status = $2',
    [campaign_id, 'active']
  );
  if (!campaigns.length) return res.status(404).json({ error: 'Campaign not found' });

  const campaign = campaigns[0];

  // Load contributor's custodial secret
  const { rows: users } = await db.query(
    'SELECT wallet_secret_encrypted FROM users WHERE id = $1',
    [req.user.userId]
  );
  const senderSecret = users[0].wallet_secret_encrypted; // decrypt in production

  let txHash;

  if (send_asset === campaign.asset_type) {
    // Direct payment — same asset, no conversion needed
    txHash = await submitPayment({
      senderSecret,
      destinationPublicKey: campaign.wallet_public_key,
      asset: send_asset,
      amount,
      memo: `cp-${campaign_id}`,
    });
  } else {
    // Path payment — contributor sends XLM, campaign receives USDC (or vice versa)
    txHash = await submitPathPayment({
      senderSecret,
      destinationPublicKey: campaign.wallet_public_key,
      sendAsset: send_asset,
      sendMax: String(parseFloat(amount) * 1.05), // 5% slippage tolerance
      destAmount: amount,
      memo: `cp-${campaign_id}`,
    });
  }

  // The ledger monitor will index this automatically, but return tx hash immediately
  res.status(202).json({ tx_hash: txHash, message: 'Transaction submitted' });
});

module.exports = router;
