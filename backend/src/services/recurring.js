'use strict';

/**
 * recurring.js
 *
 * Recurring pledge engine. Stellar has no native recurring payment primitive, so a
 * subscription is a claimable balance schedule: when a contributor pledges, the full
 * commitment leaves their wallet immediately as one claimable balance per period.
 * The claim worker releases each balance to the campaign wallet on its scheduled date.
 */

const db = require('../config/database');
const logger = require('../config/logger');
const {
  createSubscriptionClaimableBalances,
  claimSubscriptionBalanceToCampaign,
  getClaimableBalance,
  isClaimableBalanceGoneError,
  getCampaignBalance,
  ensureCustodialAccountFundedAndTrusted,
  getSupportedAssetCodes,
} = require('./stellarService');
const { withDecryptedWalletSecret } = require('./walletSecrets');
const { buildContributionMemo } = require('./contributionService');

const PERIOD_DAYS = 30;
const ALLOWED_PERIOD_MONTHS = [1, 3, 6];
const MIN_PERIODS = 2;
const MAX_PERIODS = 24;

/** How long after its scheduled date a balance stays reclaimable only by the platform. */
const CONTRIBUTOR_RECLAIM_AFTER_DAYS = 30;

/** A balance due sooner than this can no longer be cancelled — the worker is about to claim it. */
const CANCELLATION_NOTICE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const WORKER_INTERVAL_MS = 24 * 60 * 60 * 1000;

let _workerTimer = null;

function httpError(message, statusCode, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

function toAmount(value) {
  return Number(parseFloat(value).toFixed(7));
}

/** Scheduled date of period N (1-based): now + N * periodMonths * 30 days. */
function scheduleDateForPeriod(startedAt, period, periodMonths) {
  return new Date(startedAt.getTime() + period * periodMonths * PERIOD_DAYS * DAY_MS);
}

function validateSubscriptionInput({ amountPerPeriod, asset, periodMonths, totalPeriods }) {
  const amount = parseFloat(amountPerPeriod);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw httpError('amountPerPeriod must be greater than zero', 400, 'INVALID_SUBSCRIPTION');
  }
  if (!getSupportedAssetCodes().includes(asset)) {
    throw httpError(`Unsupported asset: ${asset}`, 400, 'INVALID_SUBSCRIPTION');
  }
  if (!ALLOWED_PERIOD_MONTHS.includes(Number(periodMonths))) {
    throw httpError(
      `periodMonths must be one of: ${ALLOWED_PERIOD_MONTHS.join(', ')}`,
      400,
      'INVALID_SUBSCRIPTION'
    );
  }
  const periods = Number(totalPeriods);
  if (!Number.isInteger(periods) || periods < MIN_PERIODS || periods > MAX_PERIODS) {
    throw httpError(
      `totalPeriods must be an integer between ${MIN_PERIODS} and ${MAX_PERIODS}`,
      400,
      'INVALID_SUBSCRIPTION'
    );
  }
  return { amount: toAmount(amount), periodMonths: Number(periodMonths), totalPeriods: periods };
}

/**
 * Enable a recurring pledge: lock the full commitment into one claimable balance per period.
 */
async function createSubscription({
  campaignId,
  userId,
  amountPerPeriod,
  asset,
  periodMonths,
  totalPeriods,
}) {
  const input = validateSubscriptionInput({ amountPerPeriod, asset, periodMonths, totalPeriods });

  const { rows: campaignRows } = await db.query(
    `SELECT id, wallet_public_key, asset_type FROM campaigns
     WHERE id = $1 AND status = 'active' AND deleted_at IS NULL`,
    [campaignId]
  );
  const campaign = campaignRows[0];
  if (!campaign) throw httpError('Campaign not found', 404);

  if (asset !== campaign.asset_type) {
    throw httpError(
      `This campaign only accepts ${campaign.asset_type} pledges`,
      400,
      'INVALID_SUBSCRIPTION'
    );
  }

  const { rows: userRows } = await db.query(
    'SELECT id, wallet_public_key, wallet_secret_encrypted FROM users WHERE id = $1',
    [userId]
  );
  const contributor = userRows[0];
  if (!contributor) throw httpError('User not found', 404);

  const totalCommitment = toAmount(input.amount * input.totalPeriods);
  const balances = await getCampaignBalance(contributor.wallet_public_key);
  const available = parseFloat(balances[asset] || '0');
  if (available < totalCommitment) {
    throw httpError(
      `Your wallet holds ${available} ${asset} but this pledge commits ${totalCommitment} ${asset}`,
      400,
      'INSUFFICIENT_BALANCE_FOR_SUBSCRIPTION'
    );
  }

  const startedAt = new Date();
  const schedule = [];
  for (let period = 1; period <= input.totalPeriods; period += 1) {
    const scheduledDate = scheduleDateForPeriod(startedAt, period, input.periodMonths);
    schedule.push({
      scheduledDate,
      amount: input.amount,
      reclaimAfterUnix: Math.floor(
        (scheduledDate.getTime() + CONTRIBUTOR_RECLAIM_AFTER_DAYS * DAY_MS) / 1000
      ),
    });
  }

  const { balanceIds } = await withDecryptedWalletSecret(
    contributor.wallet_secret_encrypted,
    { userId, walletPublicKey: contributor.wallet_public_key },
    async (walletSecret) => {
      await ensureCustodialAccountFundedAndTrusted({
        publicKey: contributor.wallet_public_key,
        secret: walletSecret,
      });
      return createSubscriptionClaimableBalances({
        sourceSecret: walletSecret,
        asset,
        entries: schedule.map((entry) => ({
          amount: entry.amount,
          reclaimAfterUnix: entry.reclaimAfterUnix,
        })),
      });
    }
  );

  const client = await db.connect();
  let subscriptionId;
  try {
    await client.query('BEGIN');
    const { rows: inserted } = await client.query(
      `INSERT INTO subscriptions
         (campaign_id, contributor_user_id, amount_per_period, asset, period_months, total_periods)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [campaignId, userId, input.amount, asset, input.periodMonths, input.totalPeriods]
    );
    subscriptionId = inserted[0].id;

    for (let i = 0; i < schedule.length; i += 1) {
      await client.query(
        `INSERT INTO subscription_balances
           (subscription_id, stellar_balance_id, scheduled_date, amount)
         VALUES ($1, $2, $3, $4)`,
        [subscriptionId, balanceIds[i], schedule[i].scheduledDate.toISOString(), schedule[i].amount]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('subscriptions: failed to persist schedule after locking funds', {
      campaign_id: campaignId,
      user_id: userId,
      balance_ids: balanceIds,
      error: err.message,
    });
    throw err;
  } finally {
    client.release();
  }

  logger.info('subscriptions: created', {
    subscription_id: subscriptionId,
    campaign_id: campaignId,
    periods: input.totalPeriods,
  });

  return {
    subscriptionId,
    balanceIds,
    totalCommitment,
    firstPaymentDate: schedule[0].scheduledDate.toISOString(),
  };
}

/**
 * Cancel a subscription. Balances more than the notice period away stop being claimed and
 * become the contributor's to reclaim; anything closer (or already claimed) is returned as
 * non-cancellable.
 */
async function cancelSubscription({ campaignId, subscriptionId, userId }) {
  const { rows: subscriptionRows } = await db.query(
    `SELECT id, status FROM subscriptions
     WHERE id = $1 AND campaign_id = $2 AND contributor_user_id = $3`,
    [subscriptionId, campaignId, userId]
  );
  const subscription = subscriptionRows[0];
  if (!subscription) throw httpError('Subscription not found', 404);
  if (subscription.status === 'completed') {
    throw httpError('This subscription has already completed', 409, 'SUBSCRIPTION_COMPLETED');
  }

  const noticeCutoff = new Date(Date.now() + CANCELLATION_NOTICE_DAYS * DAY_MS);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: cancelled } = await client.query(
      `UPDATE subscription_balances
       SET status = 'cancellation_requested'
       WHERE subscription_id = $1
         AND status = 'pending'
         AND scheduled_date > $2
       RETURNING id, stellar_balance_id, scheduled_date, amount`,
      [subscriptionId, noticeCutoff.toISOString()]
    );

    const { rows: nonCancellable } = await client.query(
      `SELECT id, stellar_balance_id, scheduled_date, amount, status
       FROM subscription_balances
       WHERE subscription_id = $1
         AND status IN ('pending', 'claimed')
       ORDER BY scheduled_date`,
      [subscriptionId]
    );

    await client.query(
      `UPDATE subscriptions SET status = 'cancelled' WHERE id = $1`,
      [subscriptionId]
    );

    await client.query('COMMIT');

    // The earliest date the contributor's reclaim predicate opens on a cancelled balance.
    const earliestCancelled = cancelled
      .map((row) => new Date(row.scheduled_date).getTime())
      .sort((a, b) => a - b)[0];
    const estimatedRefundDate = earliestCancelled
      ? new Date(earliestCancelled + CONTRIBUTOR_RECLAIM_AFTER_DAYS * DAY_MS).toISOString()
      : null;

    logger.info('subscriptions: cancelled', {
      subscription_id: subscriptionId,
      cancelled: cancelled.length,
      non_cancellable: nonCancellable.length,
    });

    return {
      cancelled: cancelled.length,
      nonCancellable: nonCancellable.length,
      non_cancellable_balances: nonCancellable.map((row) => ({
        id: row.id,
        stellar_balance_id: row.stellar_balance_id,
        scheduled_date: row.scheduled_date,
        amount: row.amount,
        status: row.status,
        reason: row.status === 'claimed' ? 'already_claimed' : 'within_notice_period',
      })),
      estimatedRefundDate,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Active and past subscriptions for the contributor dashboard. */
async function listSubscriptionsForUser(userId) {
  const { rows } = await db.query(
    `SELECT s.id, s.campaign_id, c.title AS campaign_title, s.amount_per_period, s.asset,
            s.period_months, s.total_periods, s.status, s.created_at,
            COUNT(sb.id) FILTER (WHERE sb.status = 'claimed')::int AS periods_claimed,
            MIN(sb.scheduled_date) FILTER (WHERE sb.status = 'pending') AS next_payment_date
     FROM subscriptions s
     JOIN campaigns c ON c.id = s.campaign_id
     LEFT JOIN subscription_balances sb ON sb.subscription_id = s.id
     WHERE s.contributor_user_id = $1
     GROUP BY s.id, c.title
     ORDER BY s.created_at DESC`,
    [userId]
  );
  return rows;
}

/**
 * Close out a subscription whose balances are all resolved: completed when every period was
 * claimed, cancelled when the contributor took any of them back.
 */
async function settleSubscriptionStatus(client, subscriptionId) {
  const { rows } = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
       COUNT(*) FILTER (WHERE status = 'contributor_reclaimed')::int AS reclaimed,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'claimed')::int AS claimed
     FROM subscription_balances
     WHERE subscription_id = $1`,
    [subscriptionId]
  );
  const counts = rows[0];
  if (counts.pending > 0) return null;

  const status = counts.claimed === counts.total ? 'completed' : 'cancelled';
  await client.query(
    `UPDATE subscriptions SET status = $2 WHERE id = $1 AND status <> $2`,
    [subscriptionId, status]
  );
  return status;
}

async function markBalanceReclaimed(subscriptionId, balanceRowId) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE subscription_balances SET status = 'contributor_reclaimed' WHERE id = $1`,
      [balanceRowId]
    );
    await client.query(`UPDATE subscriptions SET status = 'cancelled' WHERE id = $1`, [
      subscriptionId,
    ]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function recordClaimedBalance({ balance, txHash }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: updated } = await client.query(
      `UPDATE subscription_balances
       SET status = 'claimed', claimed_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [balance.id]
    );
    if (!updated.length) {
      await client.query('ROLLBACK');
      return null;
    }

    // The ledger monitor also sees the claim's payment leg, so whichever writer gets there
    // first records the contribution and moves raised_amount — never both.
    const { rows: contributionRows } = await client.query(
      `INSERT INTO contributions
         (campaign_id, sender_public_key, amount, asset, payment_type, tx_hash)
       VALUES ($1, $2, $3, $4, 'subscription_claim', $5)
       ON CONFLICT (tx_hash) DO NOTHING
       RETURNING id`,
      [
        balance.campaign_id,
        balance.contributor_public_key,
        balance.amount,
        balance.asset,
        txHash,
      ]
    );

    if (contributionRows.length) {
      await client.query(
        `UPDATE campaigns
         SET raised_amount = raised_amount + $1,
             status = CASE
               WHEN raised_amount + $1 >= target_amount THEN 'funded'
               ELSE status
             END
         WHERE id = $2`,
        [balance.amount, balance.campaign_id]
      );
    }

    const subscriptionStatus = await settleSubscriptionStatus(client, balance.subscription_id);
    await client.query('COMMIT');
    return { subscriptionStatus };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * SubscriptionClaimWorker — claims every subscription balance whose scheduled date has passed.
 * Balances the contributor already reclaimed are recorded as such and end the subscription.
 */
async function processDueSubscriptionBalances() {
  const { rows: due } = await db.query(
    `SELECT sb.id, sb.subscription_id, sb.stellar_balance_id, sb.amount, sb.scheduled_date,
            s.asset, s.campaign_id, c.wallet_public_key AS campaign_public_key,
            u.wallet_public_key AS contributor_public_key
     FROM subscription_balances sb
     JOIN subscriptions s ON s.id = sb.subscription_id
     JOIN campaigns c ON c.id = s.campaign_id
     JOIN users u ON u.id = s.contributor_user_id
     WHERE sb.status = 'pending'
       AND sb.scheduled_date <= NOW()
     ORDER BY sb.scheduled_date
     LIMIT 200`
  );

  if (!due.length) {
    logger.debug('subscription-claim-worker: nothing due');
    return { claimed: 0, reclaimed: 0, failed: 0 };
  }

  let claimed = 0;
  let reclaimed = 0;
  let failed = 0;

  for (const balance of due) {
    try {
      const onLedger = await getClaimableBalance(balance.stellar_balance_id);
      if (!onLedger) {
        await markBalanceReclaimed(balance.subscription_id, balance.id);
        reclaimed += 1;
        continue;
      }

      const txHash = await claimSubscriptionBalanceToCampaign({
        balanceId: balance.stellar_balance_id,
        asset: balance.asset,
        amount: balance.amount,
        destinationPublicKey: balance.campaign_public_key,
        memo: buildContributionMemo(balance.campaign_id),
      });

      await recordClaimedBalance({ balance, txHash });
      claimed += 1;
    } catch (err) {
      if (isClaimableBalanceGoneError(err)) {
        await markBalanceReclaimed(balance.subscription_id, balance.id);
        reclaimed += 1;
        continue;
      }
      failed += 1;
      logger.error('subscription-claim-worker: claim failed', {
        subscription_balance_id: balance.id,
        error: err.message,
      });
    }
  }

  logger.info('subscription-claim-worker: done', { claimed, reclaimed, failed });
  return { claimed, reclaimed, failed };
}

function startSubscriptionClaimWorker() {
  processDueSubscriptionBalances().catch((err) =>
    logger.error('subscription-claim-worker: initial run failed', { error: err.message })
  );
  _workerTimer = setInterval(() => {
    processDueSubscriptionBalances().catch((err) =>
      logger.error('subscription-claim-worker: run failed', { error: err.message })
    );
  }, WORKER_INTERVAL_MS);
  logger.info('subscription-claim-worker: started', { interval_ms: WORKER_INTERVAL_MS });
}

function stopSubscriptionClaimWorker() {
  if (_workerTimer) {
    clearInterval(_workerTimer);
    _workerTimer = null;
  }
}

module.exports = {
  createSubscription,
  cancelSubscription,
  listSubscriptionsForUser,
  processDueSubscriptionBalances,
  startSubscriptionClaimWorker,
  stopSubscriptionClaimWorker,
  ALLOWED_PERIOD_MONTHS,
  MIN_PERIODS,
  MAX_PERIODS,
  CANCELLATION_NOTICE_DAYS,
  CONTRIBUTOR_RECLAIM_AFTER_DAYS,
};
