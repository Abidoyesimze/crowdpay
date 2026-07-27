const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const proxyquire = require('proxyquire').noCallThru();

const CAMPAIGN_ID = 'cam-1';
const CONTRIBUTOR_ID = 'user-1';

function buildApp({ queryImpl, hasContributed = true } = {}) {
  const defaultQuery = async (sql, params) => {
    if (sql.includes('SELECT id, creator_id, title FROM campaigns')) {
      return { rows: [{ id: CAMPAIGN_ID, creator_id: 'creator-1', title: 'Test Campaign' }] };
    }
    if (sql.includes('FROM contributions')) {
      return { rows: hasContributed ? [{ id: 'contrib-1' }] : [] };
    }
    if (sql.includes('INSERT INTO disputes')) {
      const [campaignId, raisedBy, reason, description, evidenceUrl] = params;
      return {
        rows: [
          {
            id: 'dispute-1',
            campaign_id: campaignId,
            raised_by: raisedBy,
            reason,
            description,
            evidence_url: evidenceUrl,
            status: 'open',
          },
        ],
      };
    }
    if (sql.includes("SELECT email, name FROM users WHERE role = 'admin'")) {
      return { rows: [] };
    }
    return { rows: [] };
  };

  const query = queryImpl || defaultQuery;

  const router = proxyquire('./disputes', {
    '../config/database': {
      query,
      connect: async () => ({
        query,
        release: () => {},
      }),
    },
    '../middleware/auth': {
      requireAuth: (req, _res, next) => {
        req.user = { userId: CONTRIBUTOR_ID };
        next();
      },
      requireRole: () => (_req, _res, next) => next(),
    },
    '../services/emailService': {
      sendDisputeOpenedCreatorEmail: async () => {},
      sendDisputeOpenedAdminEmail: async () => {},
      sendDisputeResolvedCreatorEmail: async () => {},
      sendDisputeResolvedContributorEmail: async () => {},
    },
    '../services/webhookDispatcher': {
      emitWebhookEventForUser: async () => {},
      emitWebhookEventForCampaign: async () => {},
      WEBHOOK_EVENTS: { DISPUTE_RAISED: 'dispute.raised' },
    },
    '../config/logger': { info: () => {}, warn: () => {}, error: () => {} },
  });

  const app = express();
  app.use(express.json());
  app.use('/api', router);
  return app;
}

// --- evidence_url validation (#490) -----------------------------------------

test('POST /campaigns/:id/disputes returns 422 for an invalid reason', async () => {
  const app = buildApp();

  const res = await request(app)
    .post(`/api/campaigns/${CAMPAIGN_ID}/disputes`)
    .send({ reason: 'made_up_reason', description: 'Something went wrong' });

  assert.equal(res.status, 422);
  assert.match(res.body.error, /reason must be one of/);
});

test('POST /campaigns/:id/disputes returns 422 for a missing description', async () => {
  const app = buildApp();

  const res = await request(app)
    .post(`/api/campaigns/${CAMPAIGN_ID}/disputes`)
    .send({ reason: 'non_delivery', description: '   ' });

  assert.equal(res.status, 422);
  assert.match(res.body.error, /description is required/);
});

test('POST /campaigns/:id/disputes returns 422 for a malformed evidence_url', async () => {
  const app = buildApp();

  const res = await request(app)
    .post(`/api/campaigns/${CAMPAIGN_ID}/disputes`)
    .send({
      reason: 'non_delivery',
      description: 'The item never arrived',
      evidence_url: 'not a url at all',
    });

  assert.equal(res.status, 422);
  assert.match(res.body.error, /evidence_url must be a valid/);
});

test('POST /campaigns/:id/disputes accepts a missing evidence_url', async () => {
  const app = buildApp();

  const res = await request(app)
    .post(`/api/campaigns/${CAMPAIGN_ID}/disputes`)
    .send({ reason: 'non_delivery', description: 'The item never arrived' });

  assert.equal(res.status, 201);
});

test('POST /campaigns/:id/disputes accepts a valid https evidence_url', async () => {
  const app = buildApp();

  const res = await request(app)
    .post(`/api/campaigns/${CAMPAIGN_ID}/disputes`)
    .send({
      reason: 'non_delivery',
      description: 'The item never arrived',
      evidence_url: 'https://example.com/proof.png',
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.evidence_url, 'https://example.com/proof.png');
});

test('POST /campaigns/:id/disputes returns 403 for a non-contributor', async () => {
  const app = buildApp({ hasContributed: false });

  const res = await request(app)
    .post(`/api/campaigns/${CAMPAIGN_ID}/disputes`)
    .send({ reason: 'non_delivery', description: 'The item never arrived' });

  assert.equal(res.status, 403);
});
