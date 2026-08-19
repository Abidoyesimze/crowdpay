const test = require('node:test');
const assert = require('node:assert/strict');
const proxyquire = require('proxyquire').noCallThru();

function buildLedgerMonitor(mockQuery, treasuryStub) {
  const updates = [];
  const wrappedQuery = async (text, params) => {
    if (text.includes('UPDATE campaigns') && text.includes('raised_amount = raised_amount +')) {
      updates.push({ text, params });
      return {
        rows: [{
          id: 'camp-1',
          creator_id: 'user-creator',
          title: 'Test Campaign',
          raised_amount: '100',
          target_amount: '100',
          asset_type: 'XLM',
          newly_funded: true,
        }],
      };
    }
    return mockQuery(text, params);
  };

  const mockDb = {
    query: wrappedQuery,
    connect: async () => ({
      query: wrappedQuery,
      release: () => {},
    }),
  };

  const ledgerMonitor = proxyquire('./ledgerMonitor', {
    '../config/database': mockDb,
    '../config/stellar': { server: {} },
    './stellarService': { getCampaignBalance: async () => ({}) },
    './webhookDispatcher': {
      emitWebhookEventForUser: async () => {},
      emitWebhookEventForCampaign: async () => {},
      WEBHOOK_EVENTS: { CAMPAIGN_FUNDED: 'campaign.funded', CONTRIBUTION_RECEIVED: 'contribution.received' },
    },
    './campaignStatusActions': {
      triggerCampaignStatusActions: async () => {},
    },
    './contractTreasury': {
      indexContribution: treasuryStub || (async () => ({ indexed: true })),
    },
  });

  return { ledgerMonitor, updates };
}

test('handlePayment updates stellar_transactions when a contribution row is created', async () => {
  const stellarUpdates = [];
  const mockQuery = async (text, params) => {
    if (text.includes('SELECT status, wallet_mode FROM campaigns')) return { rows: [{ status: 'active', wallet_mode: 'standard' }] };
    if (text.includes('SELECT id FROM contributions')) return { rows: [] };
    if (text.includes('SELECT creator_id FROM campaigns')) {
      return { rows: [{ creator_id: 'user-creator' }] };
    }
    if (text.includes('SELECT metadata FROM stellar_transactions')) {
      return { rows: [{ metadata: { platform_fee_amount: 0.15, referral_code: 'refcode1' } }] };
    }
    if (text.includes('SELECT id FROM campaign_referrals')) {
      return { rows: [{ id: 'ref-row-1' }] };
    }
    if (text.includes('contribution_count = contribution_count + 1')) {
      return { rows: [] };
    }
    if (text === 'BEGIN') return { rows: [] };
    if (text.includes('INSERT INTO contributions')) return { rows: [{ id: 'contrib-id' }] };
    if (text.includes('UPDATE stellar_transactions') && text.includes("kind = 'contribution'")) {
      stellarUpdates.push({ text, params });
      return { rows: [] };
    }
    if (text.includes('SELECT raised_amount FROM campaigns')) {
      return { rows: [{ raised_amount: '100' }] };
    }
    if (text === 'COMMIT') return { rows: [] };
    if (text === 'ROLLBACK') return { rows: [] };
    return { rows: [] };
  };

  const { ledgerMonitor, updates } = buildLedgerMonitor(mockQuery);

  const payment = {
    to: 'GWALLET',
    from: 'GFROM',
    type: 'payment',
    asset_type: 'native',
    amount: '1',
    transaction_hash: 'txhash-abc',
  };

  await ledgerMonitor.handlePayment('camp-1', 'GWALLET', payment);

  assert.equal(stellarUpdates.length, 1);
  assert.deepEqual(stellarUpdates[0].params, ['contrib-id', 'txhash-abc']);
  assert.equal(updates.length, 1);
  assert.match(updates[0].text, /raised_amount = raised_amount \+ \$1/);
  assert.match(updates[0].text, /WHEN raised_amount \+ \$1 >= target_amount THEN 'funded'/);
  assert.deepEqual(updates[0].params, [1, 'camp-1']);
});

test('handlePayment accepts contributions on funded campaigns', async () => {
  let insertCalled = false;
  const mockQuery = async (text) => {
    if (text.includes('SELECT status, wallet_mode FROM campaigns')) return { rows: [{ status: 'funded', wallet_mode: 'standard' }] };
    if (text.includes('SELECT id FROM contributions')) return { rows: [] };
    if (text.includes('SELECT creator_id FROM campaigns')) {
      return { rows: [{ creator_id: 'user-creator' }] };
    }
    if (text.includes('SELECT metadata FROM stellar_transactions')) {
      return { rows: [{ metadata: {} }] };
    }
    if (text === 'BEGIN') return { rows: [] };
    if (text.includes('INSERT INTO contributions')) {
      insertCalled = true;
      return { rows: [{ id: 'contrib-id' }] };
    }
    if (text.includes('SELECT raised_amount FROM campaigns')) {
      return { rows: [{ raised_amount: '110' }] };
    }
    if (text === 'COMMIT') return { rows: [] };
    return { rows: [] };
  };

  const { ledgerMonitor } = buildLedgerMonitor(mockQuery);

  await ledgerMonitor.handlePayment('camp-1', 'GWALLET', {
    to: 'GWALLET',
    from: 'GFROM',
    type: 'payment',
    asset_type: 'native',
    amount: '10',
    transaction_hash: 'txhash-overfund',
  });

  assert.equal(insertCalled, true);
});

/** Query stub for a contract-mode campaign that reaches the end of handlePayment. */
function contractModeQuery(seen = {}) {
  return async (text) => {
    if (text.includes('SELECT status, wallet_mode FROM campaigns')) {
      return { rows: [{ status: 'active', wallet_mode: 'contract' }] };
    }
    if (text.includes('SELECT id FROM contributions')) return { rows: [] };
    if (text.includes('SELECT creator_id FROM campaigns')) {
      return { rows: [{ creator_id: 'user-creator' }] };
    }
    if (text.includes('SELECT metadata FROM stellar_transactions')) {
      return { rows: [{ metadata: {} }] };
    }
    if (text === 'BEGIN') return { rows: [] };
    if (text.includes('INSERT INTO contributions')) {
      seen.insert = true;
      return { rows: [{ id: 'contrib-1' }] };
    }
    if (text.includes('SELECT raised_amount FROM campaigns')) {
      return { rows: [{ raised_amount: '100' }] };
    }
    if (text === 'COMMIT') {
      seen.commit = true;
      return { rows: [] };
    }
    if (text === 'ROLLBACK') {
      seen.rollback = true;
      return { rows: [] };
    }
    return { rows: [] };
  };
}

test('handlePayment books the contribution on the treasury for a contract-mode campaign', async () => {
  const indexed = [];
  const mockQuery = contractModeQuery();

  const { ledgerMonitor } = buildLedgerMonitor(mockQuery, async (campaignId, params) => {
    indexed.push({ campaignId, ...params });
    return { indexed: true };
  });

  await ledgerMonitor.handlePayment('camp-1', 'GWALLET', {
    to: 'GWALLET',
    from: 'GFROM',
    type: 'payment',
    asset_type: 'native',
    amount: '25',
    transaction_hash: 'txhash-contract',
  });

  assert.equal(indexed.length, 1);
  assert.equal(indexed[0].campaignId, 'camp-1');
  assert.equal(indexed[0].contributor, 'GFROM');
  assert.equal(indexed[0].amount, '25');
});

test('a treasury indexing failure does not undo an already-committed contribution', async () => {
  const seen = { insert: false, commit: false, rollback: false };
  const mockQuery = contractModeQuery(seen);

  const { ledgerMonitor } = buildLedgerMonitor(mockQuery, async () => {
    throw new Error('soroban rpc unavailable');
  });

  // The payment is final on Stellar, so the contribution stands and the failure
  // is only logged for retry.
  await ledgerMonitor.handlePayment('camp-1', 'GWALLET', {
    to: 'GWALLET',
    from: 'GFROM',
    type: 'payment',
    asset_type: 'native',
    amount: '25',
    transaction_hash: 'txhash-treasury-down',
  });

  assert.equal(seen.insert, true, 'the contribution row is still written');
  assert.equal(seen.commit, true, 'the transaction still commits');
  assert.equal(seen.rollback, false, 'a confirmed contribution is never rolled back');
});
