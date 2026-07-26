const db = require('../config/database');

async function listCreatorCampaigns(userId, options = {}) {
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(Math.max(1, parseInt(options.limit, 10) || 20), 100);
  const offset = (page - 1) * limit;

  const countResult = await db.query(
    'SELECT COUNT(*)::int AS total FROM campaigns WHERE creator_id = $1',
    [userId]
  );
  const total = countResult.rows[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const { rows } = await db.query(
    `SELECT c.id, c.title, c.status, c.asset_type, c.target_amount, c.raised_amount,
            c.deadline, c.created_at, c.is_hidden,
            COALESCE(stats.contributor_count, 0) AS contributor_count,
            EXISTS (
              SELECT 1 FROM milestones m WHERE m.campaign_id = c.id LIMIT 1
            ) AS has_milestones
     FROM campaigns c
     LEFT JOIN LATERAL (
       SELECT COUNT(DISTINCT sender_public_key)::int AS contributor_count
       FROM contributions ctr
       WHERE ctr.campaign_id = c.id
     ) stats ON TRUE
     WHERE c.creator_id = $1
     ORDER BY c.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return {
    data: rows,
    pagination: { page, limit, total, totalPages },
  };
}

async function listUserContributions(userId) {
  const { rows: userRows } = await db.query(
    'SELECT wallet_public_key FROM users WHERE id = $1',
    [userId]
  );
  if (!userRows.length) return null;

  const senderPublicKey = userRows[0].wallet_public_key;
  const { rows } = await db.query(
    `SELECT ctr.id, ctr.amount, ctr.asset, ctr.anchor_id, ctr.anchor_transaction_id,
            ctr.source_amount, ctr.source_asset, ctr.conversion_rate, ctr.payment_type,
            ctr.tx_hash, ctr.created_at,
            c.id AS campaign_id, c.title AS campaign_title, c.status AS campaign_status,
            c.target_amount, c.raised_amount
     FROM contributions ctr
     JOIN campaigns c ON c.id = ctr.campaign_id
     WHERE ctr.sender_public_key = $1
     ORDER BY ctr.created_at DESC`,
    [senderPublicKey]
  );
  return rows;
}

const ACTIVE_CAMPAIGN_STATUSES = new Set(['active', 'funded']);
const COMPLETED_CAMPAIGN_STATUSES = new Set(['completed', 'funded', 'withdrawn']);

const BADGE_DEFINITIONS = [
  {
    id: 'first_contribution',
    label: 'First contribution',
    earned: (stats) => stats.campaigns_backed >= 1,
  },
  {
    id: 'backed_5_campaigns',
    label: 'Backed 5 campaigns',
    earned: (stats) => stats.campaigns_backed >= 5,
  },
  {
    id: 'backed_10_campaigns',
    label: 'Backed 10 campaigns',
    earned: (stats) => stats.campaigns_backed >= 10,
  },
  {
    id: 'contributed_1000',
    label: 'Contributed 1,000+',
    earned: (stats) => stats.total_contributed >= 1000,
  },
  {
    id: 'backed_completed_campaign',
    label: 'Backed a completed campaign',
    earned: (stats) => stats.campaigns_completed >= 1,
  },
];

function computeBadges(stats) {
  return BADGE_DEFINITIONS.map((def) => ({
    id: def.id,
    label: def.label,
    earned: def.earned(stats),
  }));
}

async function getContributorDashboard(userId) {
  const { rows: userRows } = await db.query(
    'SELECT wallet_public_key FROM users WHERE id = $1',
    [userId]
  );
  if (!userRows.length) return null;

  const senderPublicKey = userRows[0].wallet_public_key;

  const { rows: contribs } = await db.query(
    `SELECT ctr.id, ctr.amount, ctr.asset, ctr.tx_hash, ctr.created_at,
            ctr.contract_refunded_at, ctr.contract_refund_tx_hash,
            c.id AS campaign_id, c.title AS campaign_title, c.status AS campaign_status,
            c.target_amount, c.raised_amount, c.asset_type, c.deadline, c.escrow_contract_id
     FROM contributions ctr
     JOIN campaigns c ON c.id = ctr.campaign_id
     WHERE ctr.sender_public_key = $1
     ORDER BY ctr.created_at DESC`,
    [senderPublicKey]
  );

  if (!contribs.length) {
    const emptyStats = {
      total_contributed: 0,
      active_campaigns_backed: 0,
      total_refunded: 0,
      campaigns_backed: 0,
      campaigns_completed: 0,
      avg_contribution: 0,
    };
    return {
      stats: { ...emptyStats, badges: computeBadges(emptyStats) },
      campaigns: [],
    };
  }

  const campaignIds = [...new Set(contribs.map((row) => row.campaign_id))];

  const { rows: milestones } = await db.query(
    `SELECT id, campaign_id, title, release_percentage, sort_order, status
     FROM milestones
     WHERE campaign_id = ANY($1::int[])
     ORDER BY campaign_id, sort_order ASC`,
    [campaignIds]
  );

  const milestonesByCampaign = {};
  for (const milestone of milestones) {
    if (!milestonesByCampaign[milestone.campaign_id]) {
      milestonesByCampaign[milestone.campaign_id] = [];
    }
    milestonesByCampaign[milestone.campaign_id].push({
      id: milestone.id,
      title: milestone.title,
      release_percentage: Number(milestone.release_percentage),
      status: milestone.status,
    });
  }

  const campaignsMap = new Map();
  let totalContributed = 0;
  let totalRefunded = 0;

  for (const row of contribs) {
    const amount = Number(row.amount);
    totalContributed += amount;
    if (row.contract_refunded_at) totalRefunded += amount;

    if (!campaignsMap.has(row.campaign_id)) {
      campaignsMap.set(row.campaign_id, {
        campaign_id: row.campaign_id,
        title: row.campaign_title,
        status: row.campaign_status,
        target_amount: Number(row.target_amount),
        raised_amount: Number(row.raised_amount),
        asset_type: row.asset_type,
        deadline: row.deadline,
        escrow_contract_id: row.escrow_contract_id,
        contributed_amount: 0,
        contributions: [],
        milestones: milestonesByCampaign[row.campaign_id] || [],
      });
    }

    const campaign = campaignsMap.get(row.campaign_id);
    campaign.contributed_amount += amount;
    campaign.contributions.push({
      id: row.id,
      amount,
      asset: row.asset,
      tx_hash: row.tx_hash,
      created_at: row.created_at,
      refund_status: row.contract_refunded_at
        ? 'processed'
        : row.campaign_status === 'failed'
          ? 'pending'
          : null,
      refund_tx_hash: row.contract_refund_tx_hash,
    });
  }

  const allCampaigns = [...campaignsMap.values()];
  const activeCampaignsBacked = allCampaigns.filter((campaign) =>
    ACTIVE_CAMPAIGN_STATUSES.has(campaign.status)
  ).length;
  const campaignsCompleted = allCampaigns.filter((campaign) =>
    COMPLETED_CAMPAIGN_STATUSES.has(campaign.status)
  ).length;

  const stats = {
    total_contributed: totalContributed,
    active_campaigns_backed: activeCampaignsBacked,
    total_refunded: totalRefunded,
    campaigns_backed: allCampaigns.length,
    campaigns_completed: campaignsCompleted,
    avg_contribution: contribs.length ? totalContributed / contribs.length : 0,
  };

  return {
    stats: { ...stats, badges: computeBadges(stats) },
    campaigns: allCampaigns,
  };
}

function csvEscape(value) {
  const str = (value === null || value === undefined) ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function getContributorDashboardCsv(userId) {
  const dashboard = await getContributorDashboard(userId);
  if (!dashboard) return null;

  const header = ['date', 'campaign', 'amount', 'asset', 'tx_hash', 'refund_status'];
  const rows = [header.join(',')];

  for (const campaign of dashboard.campaigns) {
    for (const contribution of campaign.contributions) {
      rows.push(
        [
          new Date(contribution.created_at).toISOString(),
          campaign.title,
          contribution.amount,
          contribution.asset,
          contribution.tx_hash || '',
          contribution.refund_status || '',
        ]
          .map(csvEscape)
          .join(',')
      );
    }
  }

  return rows.join('\n');
}

module.exports = {
  listCreatorCampaigns,
  listUserContributions,
  getContributorDashboard,
  getContributorDashboardCsv,
};
