const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const impactReportService = require('../services/impactReportService');
const { v4: uuidv4 } = require('uuid');

// Mock database module
let mockDbQueries = [];

const mockDb = {
  query: async (sql, params) => {
    mockDbQueries.push({ sql, params });
    // Return mock responses based on the query
    if (sql.includes('INSERT INTO campaign_impact_reports')) {
      return { rows: [{ id: uuidv4() }] };
    }
    if (sql.includes('SELECT') && sql.includes('campaign_impact_reports')) {
      if (sql.includes("status = 'published'")) {
        return { rows: [{ 
          id: uuidv4(), 
          campaign_id: params[0], 
          creator_id: params[1],
          title: 'Test Report',
          content: 'Test content',
          summary: 'Test summary',
          status: 'published',
          published_at: new Date(),
          images: [],
          videos: [],
          milestones: [],
          views_count: 0,
          created_at: new Date(),
          updated_at: new Date(),
        }] };
      }
      if (sql.includes("status = 'draft'")) {
        return { rows: [{ 
          id: uuidv4(), 
          campaign_id: params[0],
          creator_id: params[1],
          title: 'Test Draft',
          content: 'Draft content',
          summary: 'Draft summary',
          status: 'draft',
          published_at: null,
          images: [],
          videos: [],
          milestones: [],
          views_count: 0,
          created_at: new Date(),
          updated_at: new Date(),
        }] };
      }
      if (sql.includes('campaigns')) {
        return { rows: [{ id: params[0], creator_id: params[1], status: 'completed' }] };
      }
    }
    if (sql.includes('UPDATE campaign_impact_reports')) {
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO creator_impact_badges')) {
      return { rows: [] };
    }
    if (sql.includes('SELECT DISTINCT') && sql.includes('contributions')) {
      return { rows: [{ sender_public_key: 'GTEST123' }] };
    }
    if (sql.includes('SELECT id FROM users')) {
      return { rows: [{ id: uuidv4() }] };
    }
    if (sql.includes('COUNT')) {
      return { rows: [{ count: 1 }] };
    }
    return { rows: [] };
  },
};

// Create a simple app with our router
function buildApp() {
  const app = express();
  app.use(express.json());

  // Add auth middleware mock
  app.use((req, res, next) => {
    req.user = {
      userId: 'test-user-id',
      role: 'creator',
    };
    next();
  });

  // Inject mock db
  require.cache[require.resolve('../config/database')].exports = mockDb;

  const impactReportsRouter = require('./impactReports');
  app.use('/api/campaigns', impactReportsRouter);

  return app;
}

test('createImpactReport validates creator + campaign status', async (t) => {
  mockDbQueries = [];

  const app = buildApp();
  
  const response = await request(app)
    .post('/api/campaigns/campaign-123/impact-report')
    .send({
      title: 'My Impact Report',
      content: '# Report\n\nThis is the content',
      summary: 'This is a summary',
    });

  assert.equal(response.status, 201);
  assert.ok(response.body.id);
});

test('createImpactReport enforces one report per campaign', async (t) => {
  mockDbQueries = [];

  const mockDbWithExisting = {
    query: async (sql, params) => {
      // Return existing report for the first query
      if (sql.includes('SELECT id FROM campaign_impact_reports WHERE campaign_id')) {
        return { rows: [{ id: uuidv4() }] };
      }
      // Return campaign info
      if (sql.includes('SELECT creator_id FROM campaigns')) {
        return { rows: [{ id: params[0], creator_id: params[1], status: 'completed' }] };
      }
      return { rows: [] };
    },
  };

  require.cache[require.resolve('../config/database')].exports = mockDbWithExisting;
  
  const app = buildApp();

  const response = await request(app)
    .post('/api/campaigns/campaign-123/impact-report')
    .send({
      title: 'My Impact Report',
      content: 'Content',
    });

  assert.equal(response.status, 409);
  assert.ok(response.body.error);
});

test('publishImpactReport awards badge to creator', async (t) => {
  mockDbQueries = [];

  const app = buildApp();

  const response = await request(app)
    .post('/api/campaigns/campaign-123/impact-report/publish')
    .send({});

  // The service will be called, which should result in badges being inserted
  assert.ok(mockDbQueries.some(q => q.sql.includes('creator_impact_badges')));
});

test('getImpactReport returns null for draft', async (t) => {
  const mockDbDraftOnly = {
    query: async (sql, params) => {
      if (sql.includes("status = 'published'")) {
        return { rows: [] }; // No published report
      }
      return { rows: [] };
    },
  };

  require.cache[require.resolve('../config/database')].exports = mockDbDraftOnly;

  const app = buildApp();

  const response = await request(app)
    .get('/api/campaigns/campaign-123/impact-report');

  assert.equal(response.status, 404);
  assert.ok(response.body.error);
});

test('getImpactReport returns report after publish', async (t) => {
  mockDbQueries = [];

  const app = buildApp();

  const response = await request(app)
    .get('/api/campaigns/campaign-123/impact-report');

  // Mock will return a published report
  assert.equal(response.status, 200);
  assert.ok(response.body.title);
  assert.equal(response.body.status, 'published');
});

test('getDraftImpactReport requires auth', async (t) => {
  const app = express();
  app.use(express.json());

  // No auth middleware
  require.cache[require.resolve('../config/database')].exports = mockDb;
  const impactReportsRouter = require('./impactReports');
  app.use('/api/campaigns', impactReportsRouter);

  const response = await request(app)
    .get('/api/campaigns/campaign-123/impact-report/draft');

  // Should fail auth check
  assert.equal(response.status, 401);
});

test('API validates required fields', async (t) => {
  const app = buildApp();

  // Missing title
  const response = await request(app)
    .post('/api/campaigns/campaign-123/impact-report')
    .send({
      content: 'Content only',
    });

  assert.equal(response.status, 400);
  assert.ok(response.body.errors);
});

test('API enforces field length limits', async (t) => {
  const app = buildApp();

  // Title too long
  const longTitle = 'a'.repeat(300);
  const response = await request(app)
    .post('/api/campaigns/campaign-123/impact-report')
    .send({
      title: longTitle,
      content: 'Content',
    });

  assert.equal(response.status, 400);
  assert.ok(response.body.errors);
});

test('impactReportService.createImpactReport validates input', async (t) => {
  require.cache[require.resolve('../config/database')].exports = mockDb;

  try {
    await impactReportService.createImpactReport({
      campaignId: null,
      creatorId: 'user-1',
      title: 'Title',
      content: 'Content',
    });
    assert.fail('Should have thrown error');
  } catch (err) {
    assert.ok(err.message.includes('Missing required fields'));
  }
});

test('impactReportService.publishImpactReport verifies creator ownership', async (t) => {
  const mockDbOwnershipCheck = {
    query: async (sql, params) => {
      if (sql.includes('SELECT id, creator_id, status FROM campaign_impact_reports')) {
        return { rows: [{ 
          id: 'report-1', 
          creator_id: 'different-user',
          status: 'draft',
        }] };
      }
      return { rows: [] };
    },
  };

  require.cache[require.resolve('../config/database')].exports = mockDbOwnershipCheck;

  try {
    await impactReportService.publishImpactReport('report-1', 'current-user');
    assert.fail('Should have thrown error');
  } catch (err) {
    assert.equal(err.status, 403);
    assert.ok(err.message.includes('creator'));
  }
});

test('impactReportService.updateImpactReport only updates draft status', async (t) => {
  const mockDbPublishedReport = {
    query: async (sql, params) => {
      if (sql.includes('SELECT id, creator_id, status FROM campaign_impact_reports')) {
        return { rows: [{ 
          id: 'report-1', 
          creator_id: 'user-1',
          status: 'published', // Already published
        }] };
      }
      return { rows: [] };
    },
  };

  require.cache[require.resolve('../config/database')].exports = mockDbPublishedReport;

  try {
    await impactReportService.updateImpactReport('report-1', 'user-1', { title: 'New Title' });
    assert.fail('Should have thrown error');
  } catch (err) {
    assert.equal(err.status, 400);
    assert.ok(err.message.includes('draft'));
  }
});

test('impactReportService.hasPublishedReport checks publication status', async (t) => {
  const mockDbCheckPublished = {
    query: async (sql, params) => {
      if (sql.includes('COUNT')) {
        return { rows: [{ count: 1 }] };
      }
      return { rows: [] };
    },
  };

  require.cache[require.resolve('../config/database')].exports = mockDbCheckPublished;

  const hasReport = await impactReportService.hasPublishedReport('campaign-1');
  assert.equal(hasReport, true);
});

test('impactReportService.getDraftImpactReport verifies creator access', async (t) => {
  const mockDbDraftOwnershipCheck = {
    query: async (sql, params) => {
      if (sql.includes("status = 'draft'")) {
        return { rows: [{ 
          id: 'draft-1',
          campaign_id: 'campaign-1',
          creator_id: 'different-user',
          title: 'Draft',
          content: 'Content',
          status: 'draft',
        }] };
      }
      return { rows: [] };
    },
  };

  require.cache[require.resolve('../config/database')].exports = mockDbDraftOwnershipCheck;

  try {
    await impactReportService.getDraftImpactReport('campaign-1', 'current-user');
    assert.fail('Should have thrown error');
  } catch (err) {
    assert.equal(err.status, 403);
    assert.ok(err.message.includes('creator'));
  }
});
