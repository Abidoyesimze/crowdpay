const express = require('express');
const { body, param } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const asyncHandler = require('../utils/asyncHandler');
const db = require('../config/database');

const router = express.Router();

const VALID_LANGUAGES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh',
  'ar', 'hi', 'bn', 'pa', 'tr', 'nl', 'pl', 'sv', 'da', 'fi',
];

const upsertValidation = [
  param('campaignId').isUUID().withMessage('Valid campaign ID is required'),
  body('language').isIn(VALID_LANGUAGES).withMessage(`Language must be one of: ${VALID_LANGUAGES.join(', ')}`),
  body('title').trim().isLength({ min: 1, max: 255 }).withMessage('Title is required (max 255 chars)'),
  body('description').optional().trim(),
];

// GET /api/campaigns/:campaignId/translations — list all translations for a campaign
router.get(
  '/:campaignId/translations',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      'SELECT id, language, title, description, created_at, updated_at FROM campaign_translations WHERE campaign_id = $1 ORDER BY language',
      [req.params.campaignId]
    );
    res.json({ success: true, data: rows });
  })
);

// POST /api/campaigns/:campaignId/translations — create or update a translation
router.post(
  '/:campaignId/translations',
  requireAuth,
  upsertValidation,
  validateRequest,
  asyncHandler(async (req, res) => {
    const { campaignId } = req.params;
    const { language, title, description } = req.body;

    // Verify user owns this campaign
    const { rows: campaigns } = await db.query(
      'SELECT creator_id FROM campaigns WHERE id = $1',
      [campaignId]
    );
    if (campaigns.length === 0) return res.status(404).json({ success: false, error: 'Campaign not found' });
    if (campaigns[0].creator_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const { rows } = await db.query(
      `INSERT INTO campaign_translations (campaign_id, language, title, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (campaign_id, language)
       DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
       RETURNING *`,
      [campaignId, language, title, description || null]
    );
    res.json({ success: true, data: rows[0] });
  })
);

// DELETE /api/campaigns/:campaignId/translations/:language — remove a translation
router.delete(
  '/:campaignId/translations/:language',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { campaignId, language } = req.params;

    const { rows: campaigns } = await db.query(
      'SELECT creator_id FROM campaigns WHERE id = $1',
      [campaignId]
    );
    if (campaigns.length === 0) return res.status(404).json({ success: false, error: 'Campaign not found' });
    if (campaigns[0].creator_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    await db.query(
      'DELETE FROM campaign_translations WHERE campaign_id = $1 AND language = $2',
      [campaignId, language]
    );
    res.json({ success: true });
  })
);

module.exports = router;
