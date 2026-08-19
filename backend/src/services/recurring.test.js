const test = require('node:test');
const assert = require('node:assert/strict');
const proxyquire = require('proxyquire').noCallThru();

const CAMPAIGN_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const SUBSCRIPTION_ID = '33333333-3333-3333-3333-333333333333';
const CAMPAIGN_WALLET = 'GCAMPAIGNWALLETPUBLICKEY';
const CONTRIBUTOR_WALLET = 'GCONTRIBUTORWALLETPUBLICKEY';

const DAY_MS = 24 * 60 * 60 * 1000;

const silentLogger = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} };

function buildService({ queryImpl, stellar = {}, clientQueryImpl }) {
  const calls = [];
  const record = (text, params) => calls.push({ text, params });

  const client = {
    query: async (text, params) => {
      record(text, params);
      return clientQueryImpl ? clientQueryImpl(text, params) : { rows: [] };
    },
    release: () => {},
  };

  const service = proxyquire('./recurring', {
    '../config/database': {
      query: async (text, params) => {
        record(text, params);
        return queryImpl ? queryImpl(text, params) : { rows: [] };
      },
      connect: async () => client,
    },
    '../config/logger': silentLogger,
    './stellarService': {
      getSupportedAssetCodes: () => ['XLM', 'USDC'],
      getCampaignBalance: async () => ({ XLM: '1000' }),
      ensureCustodialAccountFundedAndTrusted: async () => null,
      createSubscriptionClaimableBalances: async () => ({ txHash: 'tx', balanceIds: [] }),
      claimSubscriptionBalanceToCampaign: async () => 'claim-tx-hash',
      getClaimableBalance: async () => ({ id: 'balance' }),
      isClaimableBalanceGoneError: () => false,
      ...stellar,
    },
    './walletSecrets': {
      withDecryptedWalletSecret: async (_encrypted, _ctx, fn) => fn('SCONTRIBUTORSECRET'),
    },
    './contributionService': { buildContributionMemo: () => 'cp-memo' },
  });

  return { service, calls };
}

function campaignRow(overrides = {}) {
  return {
    id: CAMPAIGN_ID,
    wallet_public_key: CAMPAIGN_WALLET,
    asset_type: 'XLM',
    ...overrides,
  };
}

function userRow() {
  return {
    id: USER_ID,
    wallet_public_key: CONTRIBUTOR_WALLET,
    wallet_secret_encrypted: 'encrypted-secret',
  };
}

test('createSubscription creates one claimable balance per period with a 30-day reclaim predicate', async () => {
  let createArgs = null;
  const { service, calls } = buildService({
    queryImpl: async (text) => {
      if (text.includes('FROM campaigns')) return { rows: [campaignRow()] };
      if (text.includes('FROM users')) return { rows: [userRow()] };
      return { rows: [] };
    },
    clientQueryImpl: async (text) => {
      if (text.includes('INSERT INTO subscriptions')) return { rows: [{ id: SUBSCRIPTION_ID }] };
      return { rows: [] };
    },
    stellar: {
      createSubscriptionClaimableBalances: async (args) => {
        createArgs = args;
        return {
          txHash: 'tx',
          balanceIds: args.entries.map((_e, i) => `balance-${i + 1}`),
        };
      },
    },
  });

  const before = Date.now();
  const result = await service.createSubscription({
    campaignId: CAMPAIGN_ID,
    userId: USER_ID,
    amountPerPeriod: 10,
    asset: 'XLM',
    periodMonths: 1,
    totalPeriods: 6,
  });

  assert.equal(createArgs.entries.length, 6);
  assert.equal(result.balanceIds.length, 6);
  assert.equal(result.totalCommitment, 60);
  assert.equal(result.subscriptionId, SUBSCRIPTION_ID);

  // Period N is due at now + N * periodMonths * 30 days, and reclaimable 30 days later.
  const inserted = calls.filter((c) => c.text.includes('INSERT INTO subscription_balances'));
  assert.equal(inserted.length, 6);
  inserted.forEach((call, index) => {
    const scheduledMs = new Date(call.params[2]).getTime();
    const expectedMs = before + (index + 1) * 30 * DAY_MS;
    assert.ok(Math.abs(scheduledMs - expectedMs) < 5000);
    assert.equal(createArgs.entries[index].reclaimAfterUnix, Math.floor((scheduledMs + 30 * DAY_MS) / 1000));
  });

  assert.equal(new Date(result.firstPaymentDate).getTime(), new Date(inserted[0].params[2]).getTime());
});

test('createSubscription rejects a commitment larger than the wallet balance', async () => {
  const { service } = buildService({
    queryImpl: async (text) => {
      if (text.includes('FROM campaigns')) return { rows: [campaignRow()] };
      if (text.includes('FROM users')) return { rows: [userRow()] };
      return { rows: [] };
    },
    stellar: { getCampaignBalance: async () => ({ XLM: '50' }) },
  });

  await assert.rejects(
    () =>
      service.createSubscription({
        campaignId: CAMPAIGN_ID,
        userId: USER_ID,
        amountPerPeriod: 10,
        asset: 'XLM',
        periodMonths: 1,
        totalPeriods: 6,
      }),
    (err) => {
      assert.equal(err.code, 'INSUFFICIENT_BALANCE_FOR_SUBSCRIPTION');
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});

test('createSubscription rejects a period count outside 2–24', async () => {
  const { service } = buildService({});

  await assert.rejects(
    () =>
      service.createSubscription({
        campaignId: CAMPAIGN_ID,
        userId: USER_ID,
        amountPerPeriod: 10,
        asset: 'XLM',
        periodMonths: 1,
        totalPeriods: 25,
      }),
    /totalPeriods must be an integer between 2 and 24/
  );
});

test('cancelSubscription cancels distant periods and reports the rest as non-cancellable', async () => {
  const soon = new Date(Date.now() + 3 * DAY_MS).toISOString();
  const distant = new Date(Date.now() + 40 * DAY_MS).toISOString();

  const { service, calls } = buildService({
    queryImpl: async (text) => {
      if (text.includes('FROM subscriptions'))
        return { rows: [{ id: SUBSCRIPTION_ID, status: 'active' }] };
      return { rows: [] };
    },
    clientQueryImpl: async (text) => {
      if (text.includes("status = 'cancellation_requested'")) {
        return { rows: [{ id: 'b3', stellar_balance_id: 'balance-3', scheduled_date: distant, amount: '10' }] };
      }
      if (text.includes('FROM subscription_balances')) {
        return {
          rows: [
            { id: 'b1', stellar_balance_id: 'balance-1', scheduled_date: soon, amount: '10', status: 'claimed' },
            { id: 'b2', stellar_balance_id: 'balance-2', scheduled_date: soon, amount: '10', status: 'pending' },
          ],
        };
      }
      return { rows: [] };
    },
  });

  const result = await service.cancelSubscription({
    campaignId: CAMPAIGN_ID,
    subscriptionId: SUBSCRIPTION_ID,
    userId: USER_ID,
  });

  assert.equal(result.cancelled, 1);
  assert.equal(result.nonCancellable, 2);
  assert.deepEqual(
    result.non_cancellable_balances.map((b) => b.reason),
    ['already_claimed', 'within_notice_period']
  );
  assert.equal(
    new Date(result.estimatedRefundDate).getTime(),
    new Date(distant).getTime() + 30 * DAY_MS
  );
  assert.ok(calls.some((c) => c.text.includes("UPDATE subscriptions SET status = 'cancelled'")));
});

test('cancelSubscription 404s for a subscription belonging to someone else', async () => {
  const { service } = buildService({ queryImpl: async () => ({ rows: [] }) });

  await assert.rejects(
    () =>
      service.cancelSubscription({
        campaignId: CAMPAIGN_ID,
        subscriptionId: SUBSCRIPTION_ID,
        userId: USER_ID,
      }),
    (err) => err.statusCode === 404
  );
});

function dueBalanceRow(overrides = {}) {
  return {
    id: 'sb-1',
    subscription_id: SUBSCRIPTION_ID,
    stellar_balance_id: 'balance-1',
    amount: '10',
    scheduled_date: new Date(Date.now() - DAY_MS).toISOString(),
    asset: 'XLM',
    campaign_id: CAMPAIGN_ID,
    campaign_public_key: CAMPAIGN_WALLET,
    contributor_public_key: CONTRIBUTOR_WALLET,
    ...overrides,
  };
}

test('the claim worker claims a due balance and records it as a contribution', async () => {
  let claimArgs = null;
  const { service, calls } = buildService({
    queryImpl: async (text) => {
      if (text.includes('FROM subscription_balances sb')) return { rows: [dueBalanceRow()] };
      return { rows: [] };
    },
    clientQueryImpl: async (text) => {
      if (text.includes("SET status = 'claimed'")) return { rows: [{ id: 'sb-1' }] };
      if (text.includes('INSERT INTO contributions')) return { rows: [{ id: 'contribution-1' }] };
      if (text.includes("FILTER (WHERE status = 'pending')")) {
        return { rows: [{ pending: 0, reclaimed: 0, total: 6, claimed: 6 }] };
      }
      return { rows: [] };
    },
    stellar: {
      claimSubscriptionBalanceToCampaign: async (args) => {
        claimArgs = args;
        return 'claim-tx-hash';
      },
    },
  });

  const result = await service.processDueSubscriptionBalances();

  assert.deepEqual(result, { claimed: 1, reclaimed: 0, failed: 0 });
  assert.equal(claimArgs.balanceId, 'balance-1');
  assert.equal(claimArgs.destinationPublicKey, CAMPAIGN_WALLET);

  const contribution = calls.find((c) => c.text.includes('INSERT INTO contributions'));
  assert.equal(contribution.params[4], 'claim-tx-hash');
  assert.ok(contribution.text.includes('subscription_claim'));
  assert.ok(calls.some((c) => c.text.includes('raised_amount = raised_amount + $1')));
});

test('the claim worker completes a subscription once every period has been claimed', async () => {
  const { service, calls } = buildService({
    queryImpl: async (text) => {
      if (text.includes('FROM subscription_balances sb')) return { rows: [dueBalanceRow()] };
      return { rows: [] };
    },
    clientQueryImpl: async (text) => {
      if (text.includes("SET status = 'claimed'")) return { rows: [{ id: 'sb-1' }] };
      if (text.includes('INSERT INTO contributions')) return { rows: [{ id: 'contribution-1' }] };
      if (text.includes("FILTER (WHERE status = 'pending')")) {
        return { rows: [{ pending: 0, reclaimed: 0, total: 6, claimed: 6 }] };
      }
      return { rows: [] };
    },
  });

  await service.processDueSubscriptionBalances();

  const settle = calls.find((c) => c.text.includes('UPDATE subscriptions SET status = $2'));
  assert.equal(settle.params[1], 'completed');
});

test('the claim worker leaves a subscription active while periods are still pending', async () => {
  const { service, calls } = buildService({
    queryImpl: async (text) => {
      if (text.includes('FROM subscription_balances sb')) return { rows: [dueBalanceRow()] };
      return { rows: [] };
    },
    clientQueryImpl: async (text) => {
      if (text.includes("SET status = 'claimed'")) return { rows: [{ id: 'sb-1' }] };
      if (text.includes('INSERT INTO contributions')) return { rows: [{ id: 'contribution-1' }] };
      if (text.includes("FILTER (WHERE status = 'pending')")) {
        return { rows: [{ pending: 5, reclaimed: 0, total: 6, claimed: 1 }] };
      }
      return { rows: [] };
    },
  });

  await service.processDueSubscriptionBalances();

  assert.ok(!calls.some((c) => c.text.includes('UPDATE subscriptions SET status = $2')));
});

test('the claim worker records a contributor reclaim and cancels the subscription', async () => {
  const { service, calls } = buildService({
    queryImpl: async (text) => {
      if (text.includes('FROM subscription_balances sb')) return { rows: [dueBalanceRow()] };
      return { rows: [] };
    },
    stellar: { getClaimableBalance: async () => null },
  });

  const result = await service.processDueSubscriptionBalances();

  assert.deepEqual(result, { claimed: 0, reclaimed: 1, failed: 0 });
  assert.ok(calls.some((c) => c.text.includes("status = 'contributor_reclaimed'")));
  assert.ok(calls.some((c) => c.text.includes("UPDATE subscriptions SET status = 'cancelled'")));
});

test('the claim worker treats a vanished balance mid-claim as a contributor reclaim', async () => {
  const { service, calls } = buildService({
    queryImpl: async (text) => {
      if (text.includes('FROM subscription_balances sb')) return { rows: [dueBalanceRow()] };
      return { rows: [] };
    },
    stellar: {
      claimSubscriptionBalanceToCampaign: async () => {
        throw new Error('op_does_not_exist');
      },
      isClaimableBalanceGoneError: () => true,
    },
  });

  const result = await service.processDueSubscriptionBalances();

  assert.deepEqual(result, { claimed: 0, reclaimed: 1, failed: 0 });
  assert.ok(calls.some((c) => c.text.includes("status = 'contributor_reclaimed'")));
});
