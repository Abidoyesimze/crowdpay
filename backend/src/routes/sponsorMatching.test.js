const request = require('supertest');
const express = require('express');
const router = require('./sponsorMatching');
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');

jest.mock('../config/database');
jest.mock('../middleware/auth', () => ({
  requireAuth: jest.fn((req, res, next) => {
    req.user = { userId: 'user-uuid-1' };
    next();
  }),
}));
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));
jest.mock('../services/webhookDispatcher', () => ({
  emitWebhookEventForCampaign: jest.fn(() => Promise.resolve()),
  WEBHOOK_EVENTS: {
    SPONSOR_MATCH_CREATED: 'sponsor_match.created',
    SPONSOR_MATCH_COMPLETED: 'sponsor_match.completed',
  },
}));

describe('Sponsor Matching Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { userId: 'user-uuid-1' };
      next();
    });
    app.use('/', router);
    jest.clearAllMocks();
  });

  describe('POST /campaigns/:id/matches', () => {
    it('creates_matching_pledge', async () => {
      const campaignId = 'campaign-uuid-1';
      const mockPledge = {
        id: 'match-uuid-1',
        campaign_id: campaignId,
        sponsor_user_id: 'user-uuid-1',
        match_ratio: 1.0,
        pledge_amount: '1000',
        matched_amount: '0',
        status: 'active',
        created_at: new Date(),
      };

      db.query.mockResolvedValueOnce({ rows: [{ id: campaignId }] }); // Campaign exists
      db.query.mockResolvedValueOnce({ rows: [] }); // No existing pledge
      db.query.mockResolvedValueOnce({ rows: [mockPledge] }); // Insert pledge

      const res = await request(app)
        .post(`/${campaignId}/matches`)
        .send({
          match_ratio: 1.0,
          pledge_amount: '1000',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(mockPledge);
    });

    it('returns_404_when_campaign_not_found', async () => {
      const campaignId = 'invalid-uuid';
      
      db.query.mockResolvedValueOnce({ rows: [] }); // Campaign not found

      const res = await request(app)
        .post(`/${campaignId}/matches`)
        .send({
          match_ratio: 1.0,
          pledge_amount: '1000',
        });

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Campaign not found' });
    });

    it('validates_positive_match_ratio', async () => {
      const campaignId = 'campaign-uuid-1';

      const res = await request(app)
        .post(`/${campaignId}/matches`)
        .send({
          match_ratio: -1,
          pledge_amount: '1000',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('errors');
    });

    it('validates_positive_pledge_amount', async () => {
      const campaignId = 'campaign-uuid-1';

      const res = await request(app)
        .post(`/${campaignId}/matches`)
        .send({
          match_ratio: 1.0,
          pledge_amount: '0',
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /campaigns/:id/matches', () => {
    it('returns_campaign_matching_progress', async () => {
      const campaignId = 'campaign-uuid-1';

      db.query.mockResolvedValueOnce({ rows: [{ id: campaignId }] }); // Campaign exists
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'match-uuid-1',
            sponsor_user_id: 'sponsor-1',
            sponsor_name: 'Alice',
            match_ratio: 1.0,
            pledge_amount: 1000,
            matched_amount: 300,
            status: 'active',
            created_at: new Date(),
            contribution_count: 3,
            total_contributed: 300,
          },
        ],
      });

      const res = await request(app).get(`/${campaignId}/matches`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('totalPledged', 1000);
      expect(res.body).toHaveProperty('totalMatched', 300);
      expect(res.body).toHaveProperty('matches');
    });

    it('returns_404_when_campaign_not_found', async () => {
      const campaignId = 'invalid-uuid';
      
      db.query.mockResolvedValueOnce({ rows: [] }); // Campaign not found

      const res = await request(app).get(`/${campaignId}/matches`);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /user/sponsor-matches', () => {
    it('returns_sponsor_pledges', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'match-uuid-1',
            campaign_id: 'campaign-1',
            campaign_title: 'Campaign A',
            campaign_status: 'active',
            sponsor_user_id: 'user-uuid-1',
            sponsor_name: 'Sponsor',
            match_ratio: 1.0,
            pledge_amount: 1000,
            matched_amount: 300,
            status: 'active',
            contract_id: null,
            created_at: new Date(),
          },
        ],
      });

      const res = await request(app).get('/user/sponsor-matches');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('pledges');
      expect(res.body.pledges).toHaveLength(1);
      expect(res.body.pledges[0]).toHaveProperty('pledgeAmount', 1000);
    });
  });

  describe('PATCH /campaigns/:id/matches/:matchId/complete', () => {
    it('completes_matching_pledge', async () => {
      const campaignId = 'campaign-uuid-1';
      const matchId = 'match-uuid-1';

      const mockMatch = {
        id: matchId,
        campaign_id: campaignId,
        sponsor_user_id: 'user-uuid-1',
        creator_id: 'creator-uuid',
        pledge_amount: 1000,
        matched_amount: 600,
        status: 'completed',
      };

      db.query.mockResolvedValueOnce({
        rows: [
          {
            ...mockMatch,
            creator_id: 'creator-uuid',
          },
        ],
      }); // Get match
      db.query.mockResolvedValueOnce({ rows: [mockMatch] }); // Complete match

      const res = await request(app)
        .patch(`/${campaignId}/matches/${matchId}/complete`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('status', 'completed');
    });

    it('returns_403_when_user_not_authorized', async () => {
      const campaignId = 'campaign-uuid-1';
      const matchId = 'match-uuid-1';

      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: matchId,
            campaign_id: campaignId,
            sponsor_user_id: 'different-sponsor-uuid',
            creator_id: 'different-creator-uuid',
          },
        ],
      }); // Get match

      const res = await request(app)
        .patch(`/${campaignId}/matches/${matchId}/complete`);

      expect(res.statusCode).toBe(403);
      expect(res.body).toHaveProperty('error');
    });

    it('returns_404_when_match_not_found', async () => {
      const campaignId = 'campaign-uuid-1';
      const matchId = 'invalid-uuid';

      db.query.mockResolvedValueOnce({ rows: [] }); // Match not found

      const res = await request(app)
        .patch(`/${campaignId}/matches/${matchId}/complete`);

      expect(res.statusCode).toBe(404);
    });
  });
});
