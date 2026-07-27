'use strict';

/**
 * Soroban service unit tests — run with node:test (no DB or testnet required).
 *
 * Uses the manual mock at services/__mocks__/sorobanService.js so all Stellar
 * SDK calls and network I/O are bypassed.
 *
 * Run:
 *   NODE_ENV=test node --test src/services/sorobanService.test.js
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Use the mock instead of the real service
// ---------------------------------------------------------------------------
const soroban = require('./__mocks__/sorobanService');
const { __mock } = soroban;

// ---------------------------------------------------------------------------
// encodeMilestone tests
// ---------------------------------------------------------------------------
describe('encodeMilestone', () => {
  it('encodes a valid milestone without throwing', () => {
    const result = soroban.encodeMilestone({
      title: 'Pump procurement',
      release_percentage_units: 4000, // 40.00% in basis points
    });

    // Should return a non-null object (ScVal)
    assert.ok(result !== null && result !== undefined, 'result should not be null');
    assert.equal(typeof result, 'object', 'result should be an object');
  });

  it('throws when title is missing', () => {
    assert.throws(
      () => soroban.encodeMilestone({ release_percentage_units: 5000 }),
      /title is required/i
    );
  });

  it('throws when milestone argument is falsy', () => {
    assert.throws(
      () => soroban.encodeMilestone(null),
      /title is required/i
    );
  });

  it('encodes a 100% single-milestone campaign (10000 bps)', () => {
    assert.doesNotThrow(() =>
      soroban.encodeMilestone({
        title: 'Full release',
        release_percentage_units: 10000,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// invokeContract tests
// ---------------------------------------------------------------------------
describe('invokeContract', () => {
  beforeEach(() => {
    __mock.reset();
    __mock.clearCalls();
  });

  it('resolves with the configured return value', async () => {
    __mock.setReturnValue(BigInt(42));

    const result = await soroban.invokeContract({
      contractId: 'CCONTRACT123456789012345678901234567890123456789012345',
      method: 'get_balance',
      args: [],
      signerSecret: 'SCVMQUS5EMTHWBLJTE5XCSCMHB2ZOVKRR4ATVTRPUNRCOGKRENIL3LHR',
    });

    assert.equal(result, BigInt(42));
  });

  it('records each call for inspection', async () => {
    await soroban.invokeContract({
      contractId: 'CCONTRACT123456789012345678901234567890123456789012345',
      method: 'register_campaign',
      args: [{ id: 'camp-1', milestones: [] }],
      signerSecret: 'SCVMQUS5EMTHWBLJTE5XCSCMHB2ZOVKRR4ATVTRPUNRCOGKRENIL3LHR',
    });

    const calls = __mock.getCalls();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'register_campaign');
    assert.equal(calls[0].contractId, 'CCONTRACT123456789012345678901234567890123456789012345');
  });

  it('throws when simulateFailure is enabled', async () => {
    __mock.simulateFailure(true);

    await assert.rejects(
      () => soroban.invokeContract({
        contractId: 'CCONTRACT123456789012345678901234567890123456789012345',
        method: 'release_funds',
        args: [],
        signerSecret: 'SCVMQUS5EMTHWBLJTE5XCSCMHB2ZOVKRR4ATVTRPUNRCOGKRENIL3LHR',
      }),
      /simulated soroban contract failure/i
    );
  });

  it('throws when contractId is missing', async () => {
    await assert.rejects(
      () => soroban.invokeContract({
        contractId: '',
        method: 'register_campaign',
        args: [],
        signerSecret: 'SCVMQUS5EMTHWBLJTE5XCSCMHB2ZOVKRR4ATVTRPUNRCOGKRENIL3LHR',
      }),
      /contractId is required/i
    );
  });

  it('throws when method is missing', async () => {
    await assert.rejects(
      () => soroban.invokeContract({
        contractId: 'CCONTRACT123456789012345678901234567890123456789012345',
        method: '',
        args: [],
        signerSecret: 'SCVMQUS5EMTHWBLJTE5XCSCMHB2ZOVKRR4ATVTRPUNRCOGKRENIL3LHR',
      }),
      /method is required/i
    );
  });

  it('throws when signerSecret is missing', async () => {
    await assert.rejects(
      () => soroban.invokeContract({
        contractId: 'CCONTRACT123456789012345678901234567890123456789012345',
        method: 'release_funds',
        args: [],
        signerSecret: '',
      }),
      /signerSecret is required/i
    );
  });

  it('reset clears call history', async () => {
    await soroban.invokeContract({
      contractId: 'CCONTRACT123456789012345678901234567890123456789012345',
      method: 'noop',
      args: [],
      signerSecret: 'SCVMQUS5EMTHWBLJTE5XCSCMHB2ZOVKRR4ATVTRPUNRCOGKRENIL3LHR',
    });
    assert.equal(__mock.getCalls().length, 1);

    __mock.clearCalls();
    assert.equal(__mock.getCalls().length, 0);
  });

  it('reset restores return value to BigInt(0)', async () => {
    __mock.setReturnValue(BigInt(999));
    __mock.reset();

    const result = await soroban.invokeContract({
      contractId: 'CCONTRACT123456789012345678901234567890123456789012345',
      method: 'noop',
      args: [],
      signerSecret: 'SCVMQUS5EMTHWBLJTE5XCSCMHB2ZOVKRR4ATVTRPUNRCOGKRENIL3LHR',
    });

    assert.equal(result, BigInt(0));
  });
});

// ---------------------------------------------------------------------------
// Contract interaction integration scenario (mocked)
// ---------------------------------------------------------------------------
describe('Soroban contract integration scenario — campaign milestone release', () => {
  beforeEach(() => {
    __mock.reset();
    __mock.clearCalls();
  });

  it('full release flow: register_campaign → release_milestone → verify_state', async () => {
    const contractId = 'CCONTRACT123456789012345678901234567890123456789012345';
    const signerSecret = 'SCVMQUS5EMTHWBLJTE5XCSCMHB2ZOVKRR4ATVTRPUNRCOGKRENIL3LHR';

    // 1. Encode milestone
    const encodedMilestone = soroban.encodeMilestone({
      title: 'Pump procurement',
      release_percentage_units: 4000,
    });
    assert.ok(encodedMilestone, 'Should encode milestone without error');

    // 2. Register campaign on-chain
    __mock.setReturnValue(BigInt(1)); // 1 = success in contract
    const registerResult = await soroban.invokeContract({
      contractId,
      method: 'register_campaign',
      args: [{ id: 'camp-42', milestones: [encodedMilestone] }],
      signerSecret,
    });
    assert.equal(registerResult, BigInt(1));

    // 3. Release milestone
    __mock.setReturnValue(BigInt(0)); // 0 = OK / released state
    const releaseResult = await soroban.invokeContract({
      contractId,
      method: 'release_milestone',
      args: ['camp-42', 0],
      signerSecret,
    });
    assert.equal(releaseResult, BigInt(0));

    // 4. Verify call order
    const calls = __mock.getCalls();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].method, 'register_campaign');
    assert.equal(calls[1].method, 'release_milestone');
  });

  it('handles contract failure gracefully during release', async () => {
    __mock.simulateFailure(true);

    await assert.rejects(
      () => soroban.invokeContract({
        contractId: 'CCONTRACT123456789012345678901234567890123456789012345',
        method: 'release_milestone',
        args: ['camp-42', 0],
        signerSecret: 'SCVMQUS5EMTHWBLJTE5XCSCMHB2ZOVKRR4ATVTRPUNRCOGKRENIL3LHR',
      }),
      /simulated soroban contract failure/i
    );

    // No calls should have completed
    assert.equal(__mock.getCalls().length, 0);
  });
});
const test = require('node:test');
const proxyquire = require('proxyquire').noCallThru();

function buildService() {
  return proxyquire('./sorobanService', {
    '../config/stellar': {
      server: {
        loadAccount: async () => ({ sequence: '1' }),
        simulateTransaction: async () => ({ result: null }),
        prepareTransaction: (tx) => tx,
        submitTransaction: async () => ({ status: 'SUCCESS' }),
      },
      networkPassphrase: 'Test SDF Network ; September 2015',
    },
    '../config/logger': { info: () => {}, error: () => {}, warn: () => {} },
    '../config/constants': { TX_TIMEOUT_CONTRIBUTION_S: 30 },
  });
}

test('mapMilestoneOnChainStatus maps numeric contract statuses', () => {
  const { mapMilestoneOnChainStatus } = buildService();
  assert.equal(mapMilestoneOnChainStatus(0), 'pending');
  assert.equal(mapMilestoneOnChainStatus(1), 'submitted');
  assert.equal(mapMilestoneOnChainStatus(2), 'released');
  assert.equal(mapMilestoneOnChainStatus(3), 'rejected');
});

test('releaseMilestone throws when milestones contract is missing', async () => {
  const { releaseMilestone } = buildService();
  await assert.rejects(
    () => releaseMilestone({ milestonesContractId: null, milestoneIndex: 0, signerSecret: 'S' }),
    /does not have a milestones contract/
  );
});

test('triggerRefund throws when escrow contract is missing', async () => {
  const { triggerRefund } = buildService();
  await assert.rejects(
    () => triggerRefund({ escrowContractId: null, contributorAddress: 'GABC', signerSecret: 'S' }),
    /does not have an escrow contract/
  );
});

test('deployCampaignContracts throws when enabled without wasm hashes', async () => {
  const prevEnabled = process.env.SOROBAN_ENABLED;
  const prevEscrow = process.env.ESCROW_WASM_HASH;
  const prevMilestones = process.env.MILESTONES_WASM_HASH;
  process.env.SOROBAN_ENABLED = 'true';
  delete process.env.ESCROW_WASM_HASH;
  delete process.env.MILESTONES_WASM_HASH;

  const { deployCampaignContracts } = buildService();
  await assert.rejects(
    () => deployCampaignContracts({
      creatorPublicKey: 'GCREATOR',
      platformPublicKey: 'GPLATFORM',
      campaignId: 'abc',
      targetAmount: 100,
      deadlineUnix: 1,
      assetContractAddress: 'GASSET',
      platformFeeBps: 0,
      milestones: [],
      signerSecret: 'S' + 'A'.repeat(55),
    }),
    /WASM_HASH/
  );

  process.env.SOROBAN_ENABLED = prevEnabled;
  if (prevEscrow) process.env.ESCROW_WASM_HASH = prevEscrow;
  if (prevMilestones) process.env.MILESTONES_WASM_HASH = prevMilestones;
});
