const router = require('express').Router();
const db = require('../config/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  sendDisputeOpenedCreatorEmail,
  sendDisputeOpenedAdminEmail,
  sendDisputeResolvedCreatorEmail,
  sendDisputeResolvedContributorEmail,
} = require('../services/emailService');
const logger = require('../config/logger');
const { emitWebhookEventForUser, emitWebhookEventForCampaign, WEBHOOK_EVENTS } = require('../services/webhookDispatcher');
const { parsePagination } = require('../utils/pagination');
const asyncHandler = require('../utils/asyncHandler');

function frontendBaseUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function isValidEvidenceUrl(urlString) {
  try {
    const u = new URL(urlString);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

async function logDisputeEvent(client, { disputeId, actorId, action, note }) {
  await client.query(
    `INSERT INTO dispute_events (dispute_id, actor_id, action, note)
     VALUES ($1, $2, $3, $4)`,
    [disputeId, actorId || null, action, note || null]
  );
}

// POST /campaigns/:id/disputes — contributor raises a dispute
router.post('/campaigns/:id/disputes', requireAuth, async (req, res) => {
  const { reason, description, evidence_url } = req.body;

  const VALID_REASONS = ['non_delivery', 'misrepresentation', 'abandoned', 'other'];
  if (!VALID_REASONS.includes(reason)) {
    return res.status(422).json({ error: `reason must be one of: ${VALID_REASONS.join(', ')}` });
  }
  if (!description || !description.trim()) {
    return res.status(422).json({ error: 'description is required' });
  }
  if (evidence_url !== undefined && evidence_url !== null && evidence_url !== '' && !isValidEvidenceUrl(evidence_url)) {
    return res.status(422).json({ error: 'evidence_url must be a valid http(s) URL' });
  }

  const { rows: campaigns } = await db.query(
    'SELECT id, creator_id, title FROM campaigns WHERE id = $1',
    [req.params.id]
  );
  if (!campaigns.length) return res.status(404).json({ error: 'Campaign not found' });
  const campaign = campaigns[0];

  // Must have contributed
  const { rows: contributions } = await db.query(
    `SELECT id FROM contributions
     WHERE campaign_id = $1 AND sender_public_key = (
       SELECT wallet_public_key FROM users WHERE id = $2
     ) LIMIT 1`,
    [campaign.id, req.user.userId]
  );
  if (!contributions.length) {
    return res.status(403).json({ error: 'Only contributors who have backed this campaign can raise a dispute' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO disputes (campaign_id, raised_by, reason, description, evidence_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [campaign.id, req.user.userId, reason, description.trim(), evidence_url || null]
    );
    const dispute = rows[0];

    await logDisputeEvent(client, {
      disputeId: dispute.id,
      actorId: req.user.userId,
      action: 'raised',
      note: reason,
    });

    // Freeze any pending withdrawal requests for this campaign
    await client.query(
      `UPDATE withdrawal_requests
       SET status = 'on_hold', dispute_id = $1
       WHERE campaign_id = $2 AND status = 'pending'`,
      [dispute.id, campaign.id]
    );

    await client.query('COMMIT');

    // Notify creator
    const { rows: creatorRows } = await db.query(
      'SELECT email, name FROM users WHERE id = $1',
      [campaign.creator_id]
    );
    if (creatorRows.length) {
      sendDisputeOpenedCreatorEmail({
        to: creatorRows[0].email,
        disputeId: dispute.id,
        creatorName: creatorRows[0].name,
        campaignTitle: campaign.title,
        reason,
      }).catch((err) => logger.error('Dispute opened creator email failed', { error: err.message }));
    }

    // Notify admins
    const { rows: adminRows } = await db.query(
      "SELECT email, name FROM users WHERE role = 'admin' OR is_admin = TRUE"
    );
    const { rows: raisedByRows } = await db.query(
      'SELECT name FROM users WHERE id = $1',
      [req.user.userId]
    );
    await Promise.all(
      adminRows.map((admin) =>
        sendDisputeOpenedAdminEmail({
          to: admin.email,
          disputeId: dispute.id,
          campaignTitle: campaign.title,
          campaignId: campaign.id,
          raisedByName: raisedByRows[0]?.name || 'A contributor',
          reason,
          description: description.trim(),
          adminUrl: `${frontendBaseUrl()}/admin/disputes/${dispute.id}`,
        }).catch((err) => logger.error('Dispute opened admin email failed', { error: err.message }))
      )
    );

    logger.info('Dispute raised', { dispute_id: dispute.id, campaign_id: campaign.id });

    setImmediate(() => {
      const payload = { dispute, campaign_id: campaign.id };
      emitWebhookEventForUser(campaign.creator_id, WEBHOOK_EVENTS.DISPUTE_OPENED, payload).catch((err) =>
        logger.error('Dispute opened webhook emit failed', { error: err.message })
      );
      emitWebhookEventForCampaign(campaign.id, WEBHOOK_EVENTS.DISPUTE_OPENED, payload).catch((err) =>
        logger.error('Dispute opened webhook emit failed', { error: err.message })
      );
    });

    res.status(201).json(dispute);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'You already have an open dispute for this campaign' });
    }
    logger.error('Dispute creation failed', { error: err.message });
    res.status(500).json({ error: 'Could not raise dispute' });
  } finally {
    client.release();
  }
});

// GET /campaigns/:id/disputes — admin only
router.get('/campaigns/:id/disputes', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query, { limit: 20, max: 100 });

  const countResult = await db.query(
    'SELECT COUNT(*)::int AS total FROM disputes WHERE campaign_id = $1',
    [req.params.id]
  );
  const total = countResult.rows[0].total;

  const { rows } = await db.query(
    `SELECT d.*, u.name AS raised_by_name, u.email AS raised_by_email
     FROM disputes d
     JOIN users u ON u.id = d.raised_by
     WHERE d.campaign_id = $1
     ORDER BY d.created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.params.id, limit, offset]
  );
  res.json({ data: rows, total, limit, offset });
}));

// PATCH /disputes/:id — admin updates status + resolution note
router.patch('/disputes/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { status, resolution_note } = req.body;

  const VALID_STATUSES = ['open', 'under_review', 'resolved_creator', 'resolved_contributor', 'closed'];
  if (!VALID_STATUSES.includes(status)) {
    return res.status(422).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const { rows: disputes } = await db.query(
    'SELECT * FROM disputes WHERE id = $1',
    [req.params.id]
  );
  if (!disputes.length) return res.status(404).json({ error: 'Dispute not found' });
  const dispute = disputes[0];

  const { rows: disputeCampaigns } = await db.query('SELECT creator_id FROM campaigns WHERE id = $1', [
    dispute.campaign_id,
  ]);
  const campaignCreatorId = disputeCampaigns[0]?.creator_id;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const resolvedAt = ['resolved_creator', 'resolved_contributor', 'closed'].includes(status)
      ? 'NOW()'
      : 'NULL';

    const { rows: updated } = await client.query(
      `UPDATE disputes
       SET status = $1, resolution_note = $2, resolved_at = ${resolvedAt}
       WHERE id = $3
       RETURNING *`,
      [status, resolution_note || null, dispute.id]
    );

    await logDisputeEvent(client, {
      disputeId: dispute.id,
      actorId: req.user.userId,
      action: `status_changed_to_${status}`,
      note: resolution_note || null,
    });

    if (status === 'resolved_contributor') {
      // Trigger refund for the disputing contributor
      const { rows: campaigns } = await client.query(
        'SELECT wallet_public_key FROM campaigns WHERE id = $1',
        [dispute.campaign_id]
      );
      const { rows: contributorRows } = await client.query(
        'SELECT wallet_public_key FROM users WHERE id = $1',
        [dispute.raised_by]
      );
      const { rows: contributions } = await client.query(
        `SELECT id, amount, asset FROM contributions
         WHERE campaign_id = $1 AND sender_public_key = $2
         AND NOT EXISTS (
           SELECT 1 FROM withdrawal_requests wr WHERE wr.contribution_id = contributions.id
         )`,
        [dispute.campaign_id, contributorRows[0].wallet_public_key]
      );

      const { buildWithdrawalTransaction } = require('../services/stellarService');
      const { insertWithdrawalPendingSignatures } = require('../services/stellarTransactionService');

      for (const contribution of contributions) {
        const unsignedXdr = await buildWithdrawalTransaction({
          campaignWalletPublicKey: campaigns[0].wallet_public_key,
          destinationPublicKey: contributorRows[0].wallet_public_key,
          amount: contribution.amount,
          asset: contribution.asset,
        });
        const { rows: refundRows } = await client.query(
          `INSERT INTO withdrawal_requests
             (campaign_id, requested_by, amount, destination_key, unsigned_xdr,
              creator_signed, platform_signed, contribution_id, is_refund, dispute_id)
           VALUES ($1, $2, $3, $4, $5, FALSE, FALSE, $6, TRUE, $7)
           RETURNING id`,
          [
            dispute.campaign_id, req.user.userId, contribution.amount,
            contributorRows[0].wallet_public_key, unsignedXdr,
            contribution.id, dispute.id,
          ]
        );
        await insertWithdrawalPendingSignatures(client, {
          campaignId: dispute.campaign_id,
          withdrawalRequestId: refundRows[0].id,
          userId: req.user.userId,
          unsignedXdr,
          metadata: { dispute_id: dispute.id, contribution_id: contribution.id },
        });
      }

      // Notify contributor
      const { rows: userRows } = await db.query(
        'SELECT email, name FROM users WHERE id = $1',
        [dispute.raised_by]
      );
      const { rows: disputeCampaignRows } = await db.query(
        'SELECT title FROM campaigns WHERE id = $1',
        [dispute.campaign_id]
      );
      if (userRows.length) {
        sendDisputeResolvedContributorEmail({
          to: userRows[0].email,
          disputeId: dispute.id,
          outcome: 'resolved in your favor — a refund has been initiated',
          contributorName: userRows[0].name,
          campaignTitle: disputeCampaignRows[0]?.title,
          resolutionNote: resolution_note,
          campaignUrl: `${frontendBaseUrl()}/campaigns/${dispute.campaign_id}`,
        }).catch((err) => logger.error('Dispute resolved contributor email failed', { error: err.message }));
      }
    }

    if (status === 'resolved_creator') {
      // Unfreeze pending on_hold withdrawals for this campaign
      const { rows: unfrozen } = await client.query(
        `UPDATE withdrawal_requests
         SET status = 'pending', dispute_id = NULL
         WHERE campaign_id = $1 AND status = 'on_hold' AND dispute_id = $2
         RETURNING *`,
        [dispute.campaign_id, dispute.id]
      );
      for (const withdrawal of unfrozen) {
        setImmediate(() =>
          emitWebhookEventForUser(campaignCreatorId, WEBHOOK_EVENTS.WITHDRAWAL_UPDATED, {
            withdrawal,
          }).catch((err) => logger.error('Withdrawal updated webhook emit failed', { error: err.message }))
        );
      }

      const { rows: creatorRows } = await db.query(
        `SELECT u.email, u.name, c.title
         FROM campaigns c JOIN users u ON u.id = c.creator_id
         WHERE c.id = $1`,
        [dispute.campaign_id]
      );
      if (creatorRows.length) {
        sendDisputeResolvedCreatorEmail({
          to: creatorRows[0].email,
          disputeId: dispute.id,
          outcome: 'resolved in your favor — the dispute is closed',
          creatorName: creatorRows[0].name,
          campaignTitle: creatorRows[0].title,
          resolutionNote: resolution_note,
          campaignUrl: `${frontendBaseUrl()}/campaigns/${dispute.campaign_id}`,
        }).catch((err) => logger.error('Dispute resolved creator email failed', { error: err.message }));
      }
    }

    await client.query('COMMIT');

    if (['resolved_creator', 'resolved_contributor', 'closed'].includes(status)) {
      setImmediate(() => {
        const payload = { dispute: updated[0], campaign_id: dispute.campaign_id };
        emitWebhookEventForUser(campaignCreatorId, WEBHOOK_EVENTS.DISPUTE_RESOLVED, payload).catch((err) =>
          logger.error('Dispute resolved webhook emit failed', { error: err.message })
        );
        emitWebhookEventForCampaign(dispute.campaign_id, WEBHOOK_EVENTS.DISPUTE_RESOLVED, payload).catch((err) =>
          logger.error('Dispute resolved webhook emit failed', { error: err.message })
        );
      });
    }

    res.json(updated[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Dispute update failed', { dispute_id: dispute.id, error: err.message });
    res.status(500).json({ error: 'Could not update dispute' });
  } finally {
    client.release();
  }
});

// GET /disputes/:id/events — audit log (admin only)
router.get('/disputes/:id/events', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT de.*, u.name AS actor_name
     FROM dispute_events de
     LEFT JOIN users u ON u.id = de.actor_id
     WHERE de.dispute_id = $1
     ORDER BY de.created_at ASC`,
    [req.params.id]
  );
  res.json(rows);
}));

module.exports = router;
