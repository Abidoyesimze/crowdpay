const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const proxyquire = require('proxyquire').noCallThru();

function buildApp({ queryImpl, stellarImpl, referralImpl, userId = 'creator-1', role = 'creator', platformApproverUserId } = {}) {
  const prevApprover = process.env.PLATFORM_APPROVER_USER_ID;
  if (platformApproverUserId !== false) {
    process.env.PLATFORM_APPROVER_USER_ID = platformApproverUserId ?? userId;
  }

  const stellarStub = {
    buildWithdrawalTransaction: async () => 'xdr-base',
    getAccountMultisigConfig: async () => ({
      thresholds: { med_threshold: 2 },
      signers: [{ key: 'GCREATOR', weight: 1 }, { key: 'GPLATFORM', weight: 1 }],
    }),
    signTransactionXdr: () => 'xdr-signed',
    signatureCountFromXdr: () => 2,
    submitSignedWithdrawal: async () => 'tx-hash',
    // Default: XDR is not expired. Override in specific tests via stellarImpl.
    isXdrExpired: () => false,
    PLATFORM_PUBLIC_KEY: 'GPLATFORM',
    ...stellarImpl,
  };

  const referralStub = {
    calculateCommissions: async () => ({ program: null, commissions: [], totalCommission: '0.0000000' }),
    settleCommissions: async () => {},
    ...referralImpl,
  };

  const router = proxyquire('./withdrawals', {
    '../services/referral': referralStub,
    '../config/database': {
      connect: async () => ({
        query: queryImpl,
        release: () => {},
      }),
      query: queryImpl,
    },
    '../services/stellarService': stellarStub,
    '../services/walletSecrets': {
      withDecryptedWalletSecret: async (_ciphertext, _context, fn) => fn('SCREATOR'),
    },
    '../middleware/auth': {
      requireAuth: (req, _res, next) => {
        req.user = { userId, role };
        next();
      },
      requireRole: (...roles) => (req, res, next) => {
        if (!roles.includes(req.user.role)) {
          return res.status(403).json({ error: 'Insufficient role for this action' });
        }
        next();
      },
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/withdrawals', router);

  return { app, cleanup: () => {
    if (prevApprover === undefined) delete process.env.PLATFORM_APPROVER_USER_ID;
    else process.env.PLATFORM_APPROVER_USER_ID = prevApprover;
  } };
}

const VALID_DESTINATION = 'GASXEYHSSVN3WSHD4WSZ4O37HC2AG4JH2EB6UPHM6IXDXDRJRDJD4RZK';

function campaignRow(overrides = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    creator_id: 'creator-1',
    wallet_public_key: 'GCAMPAIGN',
    asset_type: 'USDC',
    status: 'active',
    ...overrides,
  };
}

test('GET /api/withdrawals/capabilities reflects platform approver status', async () => {
  const { app, cleanup } = buildApp({
    queryImpl: async () => ({ rows: [] }),
    userId: 'platform-1',
    role: 'admin',
    platformApproverUserId: 'platform-1',
  });
  const res = await request(app).get('/api/withdrawals/capabilities').set('Authorization', 'Bearer t');
  cleanup();
  assert.equal(res.status, 200);
  assert.equal(res.body.can_approve_platform, true);
});

test('GET /api/withdrawals/capabilities denies when user is not platform approver', async () => {
  const { app, cleanup } = buildApp({
    queryImpl: async () => ({ rows: [] }),
    userId: 'other-user',
    role: 'admin',
    platformApproverUserId: 'platform-1',
  });
  const res = await request(app).get('/api/withdrawals/capabilities').set('Authorization', 'Bearer t');
  cleanup();
  assert.equal(res.status, 200);
  assert.equal(res.body.can_approve_platform, false);
});

test('POST /api/withdrawals/request creates pending request and logs event', async () => {
  const calls = [];
  const { app, cleanup } = buildApp({
    queryImpl: async (text, params) => {
      calls.push(text);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('FROM campaigns WHERE id')) {
        return { rows: [campaignRow()] };
      }
      if (text.includes("FROM withdrawal_requests") && text.includes("status = 'pending'")) {
        return { rows: [] };
      }
      if (text.includes('wallet_public_key FROM users')) {
        return { rows: [{ wallet_public_key: 'GCREATOR' }] };
      }
      if (text.includes('INSERT INTO withdrawal_requests')) {
        return { rows: [{ id: 'w-1', status: 'pending', creator_signed: false, platform_signed: false }] };
      }
      if (text.includes('INSERT INTO withdrawal_approval_events')) {
        return { rows: [] };
      }
      if (text.includes('INSERT INTO stellar_transactions')) {
        return { rows: [{ id: 'stellar-1' }] };
      }
      return { rows: [] };
    },
  });

  const response = await request(app)
    .post('/api/withdrawals/request')
    .set('Authorization', 'Bearer token')
    .send({ campaign_id: '11111111-1111-1111-1111-111111111111', destination_key: VALID_DESTINATION, amount: '10.0000000' });

  cleanup();
  assert.equal(response.status, 201);
  assert.equal(response.body.status, 'pending');
  assert.ok(calls.some((c) => c.includes('INSERT INTO withdrawal_approval_events')));
  assert.ok(calls.some((c) => c.includes('INSERT INTO stellar_transactions')));
});

test('POST /api/withdrawals/request rejects an invalid Stellar public key with 422', async () => {
  const { app, cleanup } = buildApp({
    queryImpl: async (text) => {
      if (text.includes('FROM campaigns WHERE id')) {
        return { rows: [campaignRow()] };
      }
      return { rows: [] };
    },
  });

  const response = await request(app)
    .post('/api/withdrawals/request')
    .set('Authorization', 'Bearer token')
    .send({ campaign_id: '11111111-1111-1111-1111-111111111111', destination_key: 'not-a-valid-key', amount: '10.0000000' });

  cleanup();
  assert.equal(response.status, 422);
  assert.match(response.body.error.message, /destination_key must be a valid Stellar public key/);
});

test('POST /api/withdrawals/request returns 400 for failed campaigns', async () => {
  const { app, cleanup } = buildApp({
    role: 'admin',
    queryImpl: async (text) => {
      if (text.includes('FROM campaigns WHERE id')) {
        return { rows: [campaignRow({ status: 'failed' })] };
      }
      return { rows: [] };
    },
  });

  const response = await request(app)
    .post('/api/withdrawals/request')
    .set('Authorization', 'Bearer token')
    .send({ campaign_id: '11111111-1111-1111-1111-111111111111', destination_key: VALID_DESTINATION, amount: '10.0000000' });

  cleanup();
  assert.equal(response.status, 400);
  assert.match(response.body.error, /This campaign has failed/);
});

test('POST /api/withdrawals/request blocks when campaign not active or funded', async () => {
  const { app, cleanup } = buildApp({
    role: 'admin',
    queryImpl: async (text) => {
      if (text.includes('FROM campaigns WHERE id')) {
        return { rows: [campaignRow({ status: 'closed' })] };
      }
      return { rows: [] };
    },
  });

  const response = await request(app)
    .post('/api/withdrawals/request')
    .set('Authorization', 'Bearer token')
    .send({ campaign_id: '11111111-1111-1111-1111-111111111111', destination_key: VALID_DESTINATION, amount: '10.0000000' });

  cleanup();
  assert.equal(response.status, 409);
});

test('POST /api/withdrawals/request blocks duplicate pending', async () => {
  const { app, cleanup } = buildApp({
    queryImpl: async (text) => {
      if (text.includes('FROM campaigns WHERE id')) {
        return { rows: [campaignRow()] };
      }
      if (text.includes("status = 'pending'")) {
        return { rows: [{ id: 'existing' }] };
      }
      return { rows: [] };
    },
  });

  const response = await request(app)
    .post('/api/withdrawals/request')
    .set('Authorization', 'Bearer token')
    .send({ campaign_id: '11111111-1111-1111-1111-111111111111', destination_key: VALID_DESTINATION, amount: '10.0000000' });

  cleanup();
  assert.equal(response.status, 409);
});

test('POST /api/withdrawals/request denies invalid multisig config', async () => {
  const { app, cleanup } = buildApp({
    queryImpl: async (text) => {
      if (text.includes('FROM campaigns WHERE id')) {
        return { rows: [campaignRow()] };
      }
      if (text.includes("status = 'pending'")) return { rows: [] };
      if (text.includes('wallet_public_key FROM users')) {
        return { rows: [{ wallet_public_key: 'GCREATOR' }] };
      }
      return { rows: [] };
    },
    stellarImpl: {
      getAccountMultisigConfig: async () => ({
        thresholds: { med_threshold: 1 },
        signers: [{ key: 'GCREATOR', weight: 1 }],
      }),
    },
  });

  const response = await request(app)
    .post('/api/withdrawals/request')
    .set('Authorization', 'Bearer token')
    .send({ campaign_id: '11111111-1111-1111-1111-111111111111', destination_key: VALID_DESTINATION, amount: '10.0000000' });

  cleanup();
  assert.equal(response.status, 422);
});

test('POST /api/withdrawals/:id/approve/platform denies non-platform user when approver is configured', async () => {
  const { app, cleanup } = buildApp({
    userId: 'other-user',
    role: 'admin',
    platformApproverUserId: 'platform-user',
    queryImpl: async () => ({ rows: [] }),
  });

  const response = await request(app)
    .post('/api/withdrawals/w-1/approve/platform')
    .set('Authorization', 'Bearer token')
    .send({});

  cleanup();
  assert.equal(response.status, 403);
});

test('POST /api/withdrawals/:id/approve/platform denies before creator approval', async () => {
  const { app, cleanup } = buildApp({
    role: 'admin',
    queryImpl: async () => ({
      rows: [{
        id: 'w-1',
        status: 'pending',
        creator_signed: false,
        platform_signed: false,
        unsigned_xdr: 'xdr-base',
        campaign_status: 'active',
      }],
    }),
  });

  const response = await request(app)
    .post('/api/withdrawals/w-1/approve/platform')
    .set('Authorization', 'Bearer token')
    .send({});

  cleanup();
  assert.equal(response.status, 409);
  assert.match(response.body.error, /Creator approval/);
});

test('POST /api/withdrawals/:id/approve/creator signs withdrawal request', async () => {
  const calls = [];
  const { app, cleanup } = buildApp({
    queryImpl: async (text) => {
      calls.push(text);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('SELECT creator_id FROM campaigns WHERE id')) {
        return { rows: [{ creator_id: 'creator-1' }] };
      }
      if (text.includes('FROM withdrawal_requests wr')) {
        return {
          rows: [{
            id: 'w-1',
            status: 'pending',
            creator_signed: false,
            platform_signed: false,
            unsigned_xdr: 'xdr-base',
            creator_id: 'creator-1',
            campaign_id: '11111111-1111-1111-1111-111111111111',
            campaign_status: 'active',
          }],
        };
      }
      if (text.includes('wallet_secret_encrypted') && text.includes('FROM users')) {
        return { rows: [{ wallet_secret_encrypted: 'SCREATOR', wallet_public_key: 'GCREATOR' }] };
      }
      if (text.includes('UPDATE withdrawal_requests') && text.includes('creator_signed = TRUE')) {
        return { rows: [{ id: 'w-1', creator_signed: true, unsigned_xdr: 'xdr-signed' }] };
      }
      if (text.includes('INSERT INTO withdrawal_approval_events')) return { rows: [] };
      return { rows: [] };
    },
  });

  const response = await request(app)
    .post('/api/withdrawals/w-1/approve/creator')
    .set('Authorization', 'Bearer token')
    .send({});

  cleanup();
  assert.equal(response.status, 200);
  assert.equal(response.body.creator_signed, true);
  assert.ok(calls.some((c) => c.includes('creator_signed')));
});

test('POST /api/withdrawals/:id/approve/platform denies insufficient signatures', async () => {
  const { app, cleanup } = buildApp({
    role: 'admin',
    queryImpl: async () => ({
      rows: [{
        id: 'w-1',
        status: 'pending',
        creator_signed: true,
        platform_signed: false,
        unsigned_xdr: 'xdr-base',
        campaign_status: 'active',
      }],
    }),
    stellarImpl: {
      signatureCountFromXdr: () => 1,
    },
  });

  const response = await request(app)
    .post('/api/withdrawals/w-1/approve/platform')
    .set('Authorization', 'Bearer token')
    .send({});

  cleanup();
  assert.equal(response.status, 422);
});

test('POST /api/withdrawals/:id/approve/platform submits with dual signatures', async () => {
  const calls = [];
  const { app, cleanup } = buildApp({
    role: 'admin',
    queryImpl: async (text) => {
      calls.push(text);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('SELECT wr.*, c.status')) {
        return {
          rows: [{
            id: 'w-1',
            status: 'pending',
            creator_signed: true,
            platform_signed: false,
            unsigned_xdr: 'xdr-creator-signed',
            campaign_status: 'active',
          }],
        };
      }
      if (text.includes('UPDATE withdrawal_requests') && text.includes("status = 'approved'")) {
        return { rows: [{ id: 'w-1', status: 'approved' }] };
      }
      if (text.includes('UPDATE withdrawal_requests') && text.includes("status = 'submitted'")) {
        return { rows: [{ id: 'w-1', status: 'submitted', tx_hash: 'tx-hash' }] };
      }
      if (text.includes('INSERT INTO withdrawal_approval_events')) return { rows: [] };
      if (text.includes('UPDATE stellar_transactions') && text.includes("kind = 'withdrawal'")) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  });

  const response = await request(app)
    .post('/api/withdrawals/w-1/approve/platform')
    .set('Authorization', 'Bearer token')
    .send({});

  cleanup();
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'submitted');
  assert.ok(calls.some((c) => c.includes("status = 'submitted'")));
  assert.ok(calls.some((c) => c.includes('UPDATE stellar_transactions')));
});

test('POST /api/withdrawals/:id/approve/platform rejects duplicate approval after first request updates status', async () => {
  let currentStatus = 'pending';
  const { app, cleanup } = buildApp({
    role: 'admin',
    queryImpl: async (text) => {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('SELECT wr.*, c.status')) {
        return {
          rows: [{
            id: 'w-1',
            status: currentStatus,
            creator_signed: true,
            platform_signed: false,
            unsigned_xdr: 'xdr-creator-signed',
            campaign_status: 'active',
          }],
        };
      }
      if (text.includes('UPDATE withdrawal_requests') && text.includes("status = 'approved'")) {
        currentStatus = 'approved';
        return { rows: [{ id: 'w-1', status: 'approved' }] };
      }
      if (text.includes('UPDATE withdrawal_requests') && text.includes("status = 'submitted'")) {
        currentStatus = 'submitted';
        return { rows: [{ id: 'w-1', status: 'submitted', tx_hash: 'tx-hash' }] };
      }
      if (text.includes('INSERT INTO withdrawal_approval_events')) return { rows: [] };
      if (text.includes('UPDATE stellar_transactions') && text.includes("kind = 'withdrawal'")) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  });

  await request(app)
    .post('/api/withdrawals/w-1/approve/platform')
    .set('Authorization', 'Bearer token')
    .send({});

  const duplicateResponse = await request(app)
    .post('/api/withdrawals/w-1/approve/platform')
    .set('Authorization', 'Bearer token')
    .send({});

  cleanup();
  assert.equal(duplicateResponse.status, 409);
  assert.match(duplicateResponse.body.error, /already being processed|platform has already approved|withdrawal request changed/);
});

test('POST /api/withdrawals/:id/cancel denies after creator signed', async () => {
  const { app, cleanup } = buildApp({
    queryImpl: async () => ({
      rows: [{
        id: 'w-1',
        status: 'pending',
        creator_signed: true,
        creator_id: 'creator-1',
      }],
    }),
  });

  const response = await request(app)
    .post('/api/withdrawals/w-1/cancel')
    .set('Authorization', 'Bearer token')
    .send({ reason: 'Never mind' });

  cleanup();
  assert.equal(response.status, 409);
});

test('POST /api/withdrawals/:id/cancel succeeds before creator signs', async () => {
  const { app, cleanup } = buildApp({
    queryImpl: async (text) => {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('SELECT creator_id FROM campaigns WHERE id')) {
        return { rows: [{ creator_id: 'creator-1' }] };
      }
      if (text.includes('FROM withdrawal_requests wr')) {
        return {
          rows: [{
            id: 'w-1',
            status: 'pending',
            creator_signed: false,
            creator_id: 'creator-1',
            campaign_id: '11111111-1111-1111-1111-111111111111',
          }],
        };
      }
      if (text.includes("SET status = 'denied'")) {
        return { rows: [{ id: 'w-1', status: 'denied', denial_reason: 'x' }] };
      }
      if (text.includes('INSERT INTO withdrawal_approval_events')) return { rows: [] };
      return { rows: [] };
    },
  });

  const response = await request(app)
    .post('/api/withdrawals/w-1/cancel')
    .set('Authorization', 'Bearer token')
    .send({ reason: 'Wrong destination' });

  cleanup();
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'denied');
});

test('POST /api/withdrawals/:id/reject marks denied after creator signed', async () => {
  const { app, cleanup } = buildApp({
    userId: 'platform-user',
    role: 'admin',
    queryImpl: async (text) => {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('SELECT * FROM withdrawal_requests WHERE id')) {
        return {
          rows: [{
            id: 'w-1',
            status: 'pending',
            creator_signed: true,
            platform_signed: false,
          }],
        };
      }
      if (text.includes("SET status = 'denied'")) {
        return { rows: [{ id: 'w-1', status: 'denied' }] };
      }
      if (text.includes('INSERT INTO withdrawal_approval_events')) return { rows: [] };
      return { rows: [] };
    },
  });

  const response = await request(app)
    .post('/api/withdrawals/w-1/reject')
    .set('Authorization', 'Bearer t')
    .send({ reason: 'Compliance hold' });

  cleanup();
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'denied');
});

test('POST /api/withdrawals/:id/approve/platform logs failure when Stellar rejects', async () => {
  const { app, cleanup } = buildApp({
    role: 'admin',
    queryImpl: async (text) => {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('SELECT wr.*, c.status')) {
        return {
          rows: [{
            id: 'w-1',
            status: 'pending',
            creator_signed: true,
            platform_signed: false,
            unsigned_xdr: 'xdr',
            campaign_status: 'active',
          }],
        };
      }
      if (text.includes('UPDATE withdrawal_requests') && text.includes("status = 'approved'")) {
        return { rows: [{ id: 'w-1', status: 'approved' }] };
      }
      if (text.includes("SET status = 'failed'")) return { rows: [] };
      if (text.includes('INSERT INTO withdrawal_approval_events')) return { rows: [] };
      if (text.includes('UPDATE stellar_transactions') && text.includes("status = 'failed'")) {
        return { rows: [] };
      }
      return { rows: [] };
    },
    stellarImpl: {
      submitSignedWithdrawal: async () => {
        throw new Error('op_underfunded');
      },
    },
  });

  const response = await request(app)
    .post('/api/withdrawals/w-1/approve/platform')
    .set('Authorization', 'Bearer token')
    .send({});

  cleanup();
  assert.equal(response.status, 502);
});

test('POST /api/withdrawals/:id/approve/platform returns 410 when XDR time bounds are expired', async () => {
  const { app, cleanup } = buildApp({
    role: 'admin',
    queryImpl: async (text) => {
      if (text.includes('SELECT wr.*, c.status')) {
        return {
          rows: [{
            id: 'w-expired',
            status: 'pending',
            creator_signed: true,
            platform_signed: false,
            unsigned_xdr: 'xdr-expired',
            campaign_status: 'active',
          }],
        };
      }
      return { rows: [] };
    },
    stellarImpl: {
      // Simulate an expired XDR — isXdrExpired returns true
      isXdrExpired: () => true,
    },
  });

  const response = await request(app)
    .post('/api/withdrawals/w-expired/approve/platform')
    .set('Authorization', 'Bearer token')
    .send({});

  cleanup();
  assert.equal(response.status, 410);
  assert.match(response.body.error, /expired/i);
});

test('POST /api/withdrawals/request splits the payout between the creator and referrers', async () => {
  let builtWith;
  let insertedMetadata;
  const { app, cleanup } = buildApp({
    referralImpl: {
      calculateCommissions: async () => ({
        program: { commission_percentage: 10, max_referrers: 10 },
        commissions: [
          {
            referral_link_id: 'link-1',
            code: 'aaaa1111',
            destination_public_key: 'GALICE',
            commission_owed: '60.0000000',
          },
          {
            referral_link_id: 'link-2',
            code: 'bbbb2222',
            destination_public_key: 'GBOB',
            commission_owed: '30.0000000',
          },
        ],
        totalCommission: '90.0000000',
      }),
    },
    stellarImpl: {
      buildWithdrawalTransaction: async (params) => {
        builtWith = params;
        return 'xdr-base';
      },
    },
    queryImpl: async (text, params) => {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('FROM campaigns WHERE id')) return { rows: [campaignRow()] };
      if (text.includes('FROM withdrawal_requests') && text.includes("status = 'pending'")) return { rows: [] };
      if (text.includes('wallet_public_key FROM users')) return { rows: [{ wallet_public_key: 'GCREATOR' }] };
      if (text.includes('INSERT INTO withdrawal_requests')) {
        return { rows: [{ id: 'w-1', status: 'pending', creator_signed: false, platform_signed: false }] };
      }
      if (text.includes('INSERT INTO stellar_transactions')) {
        insertedMetadata = JSON.parse(params[4]);
        return { rows: [{ id: 'stellar-1' }] };
      }
      return { rows: [] };
    },
  });

  const response = await request(app)
    .post('/api/withdrawals/request')
    .set('Authorization', 'Bearer token')
    .send({
      campaign_id: '11111111-1111-1111-1111-111111111111',
      destination_key: VALID_DESTINATION,
      amount: '1000.0000000',
    });

  cleanup();
  assert.equal(response.status, 201);
  // Creator receives the requested amount less the 90 owed to referrers
  assert.equal(builtWith.amount, '910.0000000');
  assert.equal(builtWith.commissions.length, 2);
  assert.deepEqual(builtWith.commissions[0], { destinationPublicKey: 'GALICE', amount: '60.0000000' });
  assert.deepEqual(builtWith.commissions[1], { destinationPublicKey: 'GBOB', amount: '30.0000000' });
  assert.equal(insertedMetadata.referral_commissions.length, 2);
  assert.equal(response.body.creator_amount, '910.0000000');
});

test('POST /api/withdrawals/request rejects a withdrawal smaller than the commissions owed', async () => {
  const { app, cleanup } = buildApp({
    referralImpl: {
      calculateCommissions: async () => ({
        program: { commission_percentage: 20, max_referrers: 10 },
        commissions: [
          {
            referral_link_id: 'link-1',
            code: 'aaaa1111',
            destination_public_key: 'GALICE',
            commission_owed: '60.0000000',
          },
        ],
        totalCommission: '60.0000000',
      }),
    },
    queryImpl: async (text) => {
      if (text.includes('FROM campaigns WHERE id')) return { rows: [campaignRow()] };
      if (text.includes('FROM withdrawal_requests') && text.includes("status = 'pending'")) return { rows: [] };
      if (text.includes('wallet_public_key FROM users')) return { rows: [{ wallet_public_key: 'GCREATOR' }] };
      return { rows: [] };
    },
  });

  const response = await request(app)
    .post('/api/withdrawals/request')
    .set('Authorization', 'Bearer token')
    .send({
      campaign_id: '11111111-1111-1111-1111-111111111111',
      destination_key: VALID_DESTINATION,
      amount: '50.0000000',
    });

  cleanup();
  assert.equal(response.status, 422);
  assert.equal(response.body.code, 'COMMISSIONS_EXCEED_WITHDRAWAL');
});

test('POST /api/withdrawals/:id/approve/platform settles the commissions it submitted', async () => {
  let settled;
  const { app, cleanup } = buildApp({
    referralImpl: {
      settleCommissions: async (_client, commissions) => {
        settled = commissions;
      },
    },
    queryImpl: async (text) => {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('FROM withdrawal_requests wr')) {
        return {
          rows: [{
            id: 'w-1',
            campaign_id: '11111111-1111-1111-1111-111111111111',
            status: 'pending',
            creator_signed: true,
            platform_signed: false,
            unsigned_xdr: 'xdr-creator-signed',
            amount: '910.0000000',
            destination_key: VALID_DESTINATION,
            campaign_status: 'active',
            creator_id: 'creator-1',
          }],
        };
      }
      if (text.includes('UPDATE withdrawal_requests') && text.includes("status = 'approved'")) {
        return { rows: [{ id: 'w-1', status: 'approved' }] };
      }
      if (text.includes('UPDATE withdrawal_requests') && text.includes("status = 'submitted'")) {
        return { rows: [{ id: 'w-1', status: 'submitted', campaign_id: '11111111-1111-1111-1111-111111111111', amount: '910.0000000' }] };
      }
      if (text.includes('SELECT metadata FROM stellar_transactions')) {
        return {
          rows: [{
            metadata: {
              referral_commissions: [
                { referral_link_id: 'link-1', code: 'aaaa1111', commission_owed: '60.0000000' },
              ],
            },
          }],
        };
      }
      return { rows: [] };
    },
  });

  const response = await request(app)
    .post('/api/withdrawals/w-1/approve/platform')
    .set('Authorization', 'Bearer token')
    .send({});

  cleanup();
  assert.equal(response.status, 200);
  assert.equal(settled.length, 1);
  assert.equal(settled[0].referral_link_id, 'link-1');
  assert.equal(settled[0].commission_owed, '60.0000000');
});
