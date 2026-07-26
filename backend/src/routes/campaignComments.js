const router = require("express").Router();
const db = require("../config/database");
const { requireAuth, authenticate } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../config/logger");
const { createNotification } = require("../services/notifications");

function cleanText(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, "")
    .trim();
}

async function requireCampaignCreator(req, res, next) {
  const campaignId = req.params.id;

  const { rows } = await db.query(
    "SELECT id, creator_id, title FROM campaigns WHERE id = $1",
    [campaignId],
  );

  if (!rows.length) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  if (rows[0].creator_id !== req.user.userId && req.user.role !== "admin") {
    return res.status(403).json({
      error: "Only the campaign creator can moderate comments",
    });
  }

  req.campaign = rows[0];
  next();
}

const COMMENT_COLUMNS = `cc.id, cc.campaign_id, cc.author_id, cc.parent_id, cc.body,
       cc.hidden, cc.hidden_reason, cc.created_at, cc.updated_at,
       u.name AS author_name`;

// Public (optionally authenticated): list comments newest first, flat with parent_id.
// Hidden comments are only visible to the campaign creator/admin.
router.get(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const { rows: campaigns } = await db.query(
      "SELECT id, creator_id FROM campaigns WHERE id = $1",
      [req.params.id],
    );
    if (!campaigns.length) return res.status(404).json({ error: "Campaign not found" });

    try {
      await authenticate(req);
    } catch {
      // anonymous viewer — proceed without req.user
    }

    const canSeeHidden =
      req.user && (req.user.userId === campaigns[0].creator_id || req.user.role === "admin");

    const { rows } = await db.query(
      `SELECT ${COMMENT_COLUMNS}
       FROM campaign_comments cc
       JOIN users u ON u.id = cc.author_id
       WHERE cc.campaign_id = $1 ${canSeeHidden ? "" : "AND cc.hidden = FALSE"}
       ORDER BY cc.created_at DESC`,
      [req.params.id],
    );

    res.json(rows);
  }),
);

// Any authenticated user: post a top-level comment or a reply
router.post(
  "/:id/comments",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = cleanText(req.body.body);
    if (!body) return res.status(422).json({ error: "Body is required" });

    const { rows: campaigns } = await db.query(
      "SELECT id, creator_id, title FROM campaigns WHERE id = $1",
      [req.params.id],
    );
    if (!campaigns.length) return res.status(404).json({ error: "Campaign not found" });
    const campaign = campaigns[0];

    let parentComment = null;
    if (req.body.parent_id) {
      const { rows: parents } = await db.query(
        "SELECT id, author_id, campaign_id FROM campaign_comments WHERE id = $1",
        [req.body.parent_id],
      );
      if (!parents.length || parents[0].campaign_id !== campaign.id) {
        return res.status(422).json({ error: "Invalid parent_id" });
      }
      parentComment = parents[0];
    }

    const { rows } = await db.query(
      `INSERT INTO campaign_comments (campaign_id, author_id, parent_id, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, campaign_id, author_id, parent_id, body, hidden, hidden_reason, created_at, updated_at`,
      [req.params.id, req.user.userId, parentComment ? parentComment.id : null, body],
    );
    const { rows: authorRows } = await db.query("SELECT name FROM users WHERE id = $1", [
      req.user.userId,
    ]);
    const comment = { ...rows[0], author_name: authorRows[0]?.name };

    setImmediate(() => {
      const excerpt = body.length > 160 ? `${body.slice(0, 160).trim()}…` : body;
      if (parentComment) {
        if (parentComment.author_id !== req.user.userId) {
          createNotification(parentComment.author_id, {
            type: "comment_reply",
            title: `New reply on "${campaign.title}"`,
            body: excerpt,
            link: `/campaigns/${campaign.id}`,
          }).catch((err) =>
            logger.error("Comment reply notification failed", { error: err.message }),
          );
        }
      } else if (campaign.creator_id !== req.user.userId) {
        createNotification(campaign.creator_id, {
          type: "campaign_comment",
          title: `New comment on "${campaign.title}"`,
          body: excerpt,
          link: `/campaigns/${campaign.id}`,
        }).catch((err) => logger.error("Comment notification failed", { error: err.message }));
      }
    });

    res.status(201).json(comment);
  }),
);

// Author only: edit own comment within 24 hours
router.patch(
  "/:id/comments/:commentId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = cleanText(req.body.body);
    if (!body) return res.status(422).json({ error: "Body is required" });

    const { rows } = await db.query(
      `UPDATE campaign_comments
       SET body = $1, updated_at = NOW()
       WHERE id = $2
         AND campaign_id = $3
         AND author_id = $4
         AND created_at >= NOW() - INTERVAL '24 hours'
       RETURNING id, campaign_id, author_id, parent_id, body, hidden, hidden_reason, created_at, updated_at`,
      [body, req.params.commentId, req.params.id, req.user.userId],
    );

    if (!rows.length) {
      return res.status(403).json({ error: "Comment not found or edit window has expired" });
    }

    res.json(rows[0]);
  }),
);

// Author (own comment) OR campaign creator/admin (moderation): delete a comment
router.delete(
  "/:id/comments/:commentId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows: campaigns } = await db.query(
      "SELECT id, creator_id FROM campaigns WHERE id = $1",
      [req.params.id],
    );
    if (!campaigns.length) return res.status(404).json({ error: "Campaign not found" });

    const isModerator =
      campaigns[0].creator_id === req.user.userId || req.user.role === "admin";

    const { rowCount } = await db.query(
      `DELETE FROM campaign_comments
       WHERE id = $1
         AND campaign_id = $2
         ${isModerator ? "" : "AND author_id = $3"}`,
      isModerator
        ? [req.params.commentId, req.params.id]
        : [req.params.commentId, req.params.id, req.user.userId],
    );

    if (!rowCount) {
      return res.status(404).json({ error: "Comment not found" });
    }

    res.status(204).send();
  }),
);

// Any authenticated user: flag a comment for moderation review
router.post(
  "/:id/comments/:commentId/flag",
  requireAuth,
  asyncHandler(async (req, res) => {
    const reason = cleanText(req.body.reason || "");

    const { rows } = await db.query(
      "SELECT id FROM campaign_comments WHERE id = $1 AND campaign_id = $2",
      [req.params.commentId, req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: "Comment not found" });

    await db.query(
      `INSERT INTO campaign_comment_flags (comment_id, flagged_by, reason)
       VALUES ($1, $2, $3)
       ON CONFLICT (comment_id, flagged_by) DO NOTHING`,
      [req.params.commentId, req.user.userId, reason || null],
    );

    res.status(204).send();
  }),
);

// Creator/admin only: review queue of flagged and hidden comments
router.get(
  "/:id/comments/moderation",
  requireAuth,
  requireCampaignCreator,
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT ${COMMENT_COLUMNS}, COALESCE(f.flag_count, 0)::int AS flag_count
       FROM campaign_comments cc
       JOIN users u ON u.id = cc.author_id
       LEFT JOIN (
         SELECT comment_id, COUNT(*) AS flag_count
         FROM campaign_comment_flags
         GROUP BY comment_id
       ) f ON f.comment_id = cc.id
       WHERE cc.campaign_id = $1 AND (cc.hidden = TRUE OR COALESCE(f.flag_count, 0) > 0)
       ORDER BY flag_count DESC, cc.created_at DESC`,
      [req.params.id],
    );

    res.json(rows);
  }),
);

// Creator/admin only: hide a comment
router.post(
  "/:id/comments/:commentId/hide",
  requireAuth,
  requireCampaignCreator,
  asyncHandler(async (req, res) => {
    const reason = cleanText(req.body.reason || "");

    const { rows } = await db.query(
      `UPDATE campaign_comments
       SET hidden = TRUE, hidden_reason = $1, hidden_by = $2, hidden_at = NOW()
       WHERE id = $3 AND campaign_id = $4
       RETURNING id, campaign_id, author_id, parent_id, body, hidden, hidden_reason, created_at, updated_at`,
      [reason || null, req.user.userId, req.params.commentId, req.params.id],
    );

    if (!rows.length) return res.status(404).json({ error: "Comment not found" });
    res.json(rows[0]);
  }),
);

// Creator/admin only: unhide a comment
router.post(
  "/:id/comments/:commentId/unhide",
  requireAuth,
  requireCampaignCreator,
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `UPDATE campaign_comments
       SET hidden = FALSE, hidden_reason = NULL, hidden_by = NULL, hidden_at = NULL
       WHERE id = $1 AND campaign_id = $2
       RETURNING id, campaign_id, author_id, parent_id, body, hidden, hidden_reason, created_at, updated_at`,
      [req.params.commentId, req.params.id],
    );

    if (!rows.length) return res.status(404).json({ error: "Comment not found" });
    res.json(rows[0]);
  }),
);

module.exports = router;
