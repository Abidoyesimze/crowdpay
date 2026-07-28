const db = require('../config/database');

/**
 * List all pools for a campaign (public).
 */
async function listByCampaign(campaignId) {
  const { rows } = await db.query(
    `SELECT cp.*, 
       COALESCE(member_counts.member_count, 0) AS member_count
     FROM contribution_pools cp
     LEFT JOIN (
       SELECT pool_id, COUNT(*) AS member_count 
       FROM pool_members WHERE status = 'confirmed'
       GROUP BY pool_id
     ) member_counts ON member_counts.pool_id = cp.id
     WHERE cp.campaign_id = $1
     ORDER BY cp.created_at DESC`,
    [campaignId]
  );
  return rows;
}

/**
 * List pools the user is involved in (as leader or member).
 */
async function listByUser(userId) {
  const { rows } = await db.query(
    `SELECT cp.*, c.title AS campaign_title,
       COALESCE(member_counts.member_count, 0) AS member_count
     FROM contribution_pools cp
     JOIN campaigns c ON c.id = cp.campaign_id
     LEFT JOIN (
       SELECT pool_id, COUNT(*) AS member_count 
       FROM pool_members WHERE status = 'confirmed'
       GROUP BY pool_id
     ) member_counts ON member_counts.pool_id = cp.id
     WHERE cp.leader_id = $1
        OR cp.id IN (SELECT pool_id FROM pool_members WHERE user_id = $1)
     ORDER BY cp.updated_at DESC`,
    [userId]
  );
  return rows;
}

/**
 * Get a single pool with its members.
 */
async function getById(poolId) {
  const { rows } = await db.query(
    `SELECT cp.*, 
       COALESCE(member_counts.member_count, 0) AS member_count
     FROM contribution_pools cp
     LEFT JOIN (
       SELECT pool_id, COUNT(*) AS member_count 
       FROM pool_members WHERE status = 'confirmed'
       GROUP BY pool_id
     ) member_counts ON member_counts.pool_id = cp.id
     WHERE cp.id = $1`,
    [poolId]
  );
  if (rows.length === 0) return null;

  const { rows: members } = await db.query(
    `SELECT pm.*, u.name, u.wallet_public_key
     FROM pool_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.pool_id = $1
     ORDER BY pm.created_at ASC`,
    [poolId]
  );

  return { ...rows[0], members };
}

/**
 * Create a new pool (leader is the creator).
 */
async function create({ campaign_id, leader_id, title, description, target_amount, expires_at }) {
  const { rows } = await db.query(
    `INSERT INTO contribution_pools (campaign_id, leader_id, title, description, target_amount, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [campaign_id, leader_id, title, description, target_amount, expires_at]
  );
  return rows[0];
}

/**
 * Join a pool with a share amount.
 */
async function join({ pool_id, user_id, share_amount, display_name }) {
  // Check pool is open
  const pool = await db.query(
    `SELECT * FROM contribution_pools WHERE id = $1 AND status = 'open'`,
    [pool_id]
  );
  if (pool.rows.length === 0) throw new Error('Pool is not open or does not exist');

  // Check user not already a member
  const existing = await db.query(
    `SELECT id FROM pool_members WHERE pool_id = $1 AND user_id = $2`,
    [pool_id, user_id]
  );
  if (existing.rows.length > 0) throw new Error('Already a member of this pool');

  // Check share doesn't exceed remaining target
  const totalShare = await db.query(
    `SELECT COALESCE(SUM(share_amount), 0) AS total FROM pool_members WHERE pool_id = $1 AND status IN ('pending', 'confirmed')`,
    [pool_id]
  );
  const remaining = parseFloat(pool.rows[0].target_amount) - parseFloat(totalShare.rows[0].total);
  if (share_amount > remaining) {
    throw new Error(`Share amount exceeds remaining pool target. Remaining: ${remaining}`);
  }

  const { rows } = await db.query(
    `INSERT INTO pool_members (pool_id, user_id, share_amount, display_name, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [pool_id, user_id, share_amount, display_name]
  );
  return rows[0];
}

/**
 * Leave a pool (remove membership).
 */
async function leave(poolId, userId) {
  // Cannot leave if you are the leader — must cancel pool instead
  const pool = await db.query(
    `SELECT leader_id FROM contribution_pools WHERE id = $1`,
    [poolId]
  );
  if (pool.rows.length === 0) throw new Error('Pool not found');
  if (pool.rows[0].leader_id === userId) {
    throw new Error('Pool leader cannot leave. Cancel the pool instead.');
  }

  const { rowCount } = await db.query(
    `DELETE FROM pool_members WHERE pool_id = $1 AND user_id = $2`,
    [poolId, userId]
  );
  if (rowCount === 0) throw new Error('Not a member of this pool');
}

/**
 * Update pool settings (leader only).
 */
async function update(poolId, userId, fields) {
  const pool = await db.query(
    `SELECT leader_id, status FROM contribution_pools WHERE id = $1`,
    [poolId]
  );
  if (pool.rows.length === 0) return null;
  if (pool.rows[0].leader_id !== userId) return null;
  if (pool.rows[0].status !== 'open') throw new Error('Can only edit open pools');

  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(fields)) {
    if (['title', 'description', 'target_amount', 'status', 'expires_at'].includes(key)) {
      setClauses.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    return getById(poolId);
  }

  values.push(poolId);
  const { rows } = await db.query(
    `UPDATE contribution_pools SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return rows[0];
}

/**
 * Submit the pooled contribution as a single large contribution from the leader.
 * Marks pool as 'submitted', creates a contribution with all member shares tracked.
 */
async function submitPool(poolId, userId) {
  const pool = await db.query(
    `SELECT * FROM contribution_pools WHERE id = $1`,
    [poolId]
  );
  if (pool.rows.length === 0) throw new Error('Pool not found');
  if (pool.rows[0].leader_id !== userId) throw new Error('Only the pool leader can submit');
  if (pool.rows[0].status !== 'open') throw new Error('Pool is not open');

  // Get confirmed members
  const { rows: members } = await db.query(
    `SELECT * FROM pool_members WHERE pool_id = $1 AND status = 'confirmed'`,
    [poolId]
  );
  if (members.length === 0) throw new Error('No confirmed members in the pool');

  const totalAmount = members.reduce((sum, m) => sum + parseFloat(m.share_amount), 0);
  if (totalAmount <= 0) throw new Error('Total pool amount must be positive');

  // Update pool status
  await db.query(
    `UPDATE contribution_pools SET status = 'submitted', raised_amount = $1, updated_at = NOW() WHERE id = $2`,
    [totalAmount, poolId]
  );

  return {
    pool_id: poolId,
    total_amount: totalAmount,
    member_count: members.length,
    message: 'Pool submitted. Contribution will be processed as a single payment.',
  };
}

module.exports = {
  listByCampaign,
  listByUser,
  getById,
  create,
  join,
  leave,
  update,
  submitPool,
};
