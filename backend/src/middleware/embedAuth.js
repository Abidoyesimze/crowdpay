'use strict';

// backend/src/middleware/embedAuth.js
//
// Validates the `embedToken` query param used by the public embeddable
// discovery widget (GET /api/embed/discover). Attaches req.embedToken on
// success. Mirrors the style of middleware/auth.js's requireAuth.

const { validateEmbedToken } = require('../services/embedTokenService');
const asyncHandler = require('../utils/asyncHandler');

const requireEmbedToken = asyncHandler(async (req, res, next) => {
  const rawToken = req.query.embedToken;
  if (!rawToken) {
    return res.status(401).json({ error: 'embedToken is required' });
  }

  const tokenRow = await validateEmbedToken(rawToken);
  if (!tokenRow) {
    return res.status(401).json({ error: 'Invalid or revoked embed token' });
  }

  req.embedToken = tokenRow;
  next();
});

module.exports = { requireEmbedToken };