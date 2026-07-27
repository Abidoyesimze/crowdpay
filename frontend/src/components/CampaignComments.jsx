import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function timeAgo(dateStr) {
  return new Date(dateStr).toLocaleString();
}

function CommentComposer({ placeholder, submitLabel, onSubmit, onCancel, autoFocus }) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!value.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(value.trim());
      setValue('');
      onCancel?.();
    } catch (err) {
      setError(err.message || 'Could not post comment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: '0.5rem' }}>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={2}
        style={{
          width: '100%',
          borderRadius: '8px',
          border: '1px solid var(--color-border-lighter)',
          padding: '0.5rem 0.65rem',
          fontFamily: 'inherit',
          fontSize: '0.88rem',
          resize: 'vertical',
        }}
      />
      {error && (
        <p className="alert alert--error" style={{ marginTop: '0.35rem', fontSize: '0.8rem' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
        <button type="submit" className="btn-primary" disabled={submitting || !value.trim()}>
          {submitting ? 'Posting…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function CommentItem({ comment, replies, campaignId, isModerator, currentUserId, onChanged }) {
  const toast = useToast();
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState('');

  const isAuthor = currentUserId && String(comment.author_id) === String(currentUserId);
  const canDelete = isAuthor || isModerator;

  async function reply(body) {
    await api.postCampaignComment(campaignId, { body, parent_id: comment.id });
    onChanged();
  }

  async function remove() {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await api.deleteCampaignComment(campaignId, comment.id);
      onChanged();
    } catch (err) {
      setError(err.message || 'Could not delete comment');
    }
  }

  async function flag() {
    try {
      await api.flagCampaignComment(campaignId, comment.id, {});
      toast?.('Comment flagged for review', 'success');
    } catch (err) {
      setError(err.message || 'Could not flag comment');
    }
  }

  async function hide() {
    try {
      await api.hideCampaignComment(campaignId, comment.id, {});
      onChanged();
    } catch (err) {
      setError(err.message || 'Could not hide comment');
    }
  }

  async function unhide() {
    try {
      await api.unhideCampaignComment(campaignId, comment.id);
      onChanged();
    } catch (err) {
      setError(err.message || 'Could not unhide comment');
    }
  }

  return (
    <div style={{ padding: '0.6rem 0', borderTop: '1px solid var(--color-border-lighter)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.85rem' }}>{comment.author_name}</strong>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-hint)' }}>
          {timeAgo(comment.created_at)}
        </span>
      </div>

      {comment.hidden ? (
        <p style={{ fontSize: '0.82rem', fontStyle: 'italic', color: 'var(--color-text-hint)', margin: '0.3rem 0' }}>
          Hidden by moderator{comment.hidden_reason ? `: ${comment.hidden_reason}` : ''}
          {isModerator && ' (visible to you only)'}
        </p>
      ) : (
        <p style={{ fontSize: '0.88rem', margin: '0.3rem 0', whiteSpace: 'pre-wrap' }}>{comment.body}</p>
      )}

      {error && (
        <p className="alert alert--error" style={{ fontSize: '0.78rem', marginBottom: '0.3rem' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.78rem' }}>
        {currentUserId && (
          <button
            type="button"
            onClick={() => setReplying((r) => !r)}
            style={{ color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Reply
          </button>
        )}
        {currentUserId && !isAuthor && (
          <button
            type="button"
            onClick={flag}
            style={{ color: 'var(--color-text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Flag
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={remove}
            style={{ color: 'var(--color-error-text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Delete
          </button>
        )}
        {isModerator &&
          (comment.hidden ? (
            <button
              type="button"
              onClick={unhide}
              style={{ color: 'var(--color-text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Unhide
            </button>
          ) : (
            <button
              type="button"
              onClick={hide}
              style={{ color: 'var(--color-text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Hide
            </button>
          ))}
      </div>

      {replying && (
        <CommentComposer
          placeholder="Write a reply…"
          submitLabel="Reply"
          autoFocus
          onSubmit={reply}
          onCancel={() => setReplying(false)}
        />
      )}

      {replies.length > 0 && (
        <div style={{ marginLeft: '1.25rem', marginTop: '0.4rem' }}>
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              replies={[]}
              campaignId={campaignId}
              isModerator={isModerator}
              currentUserId={currentUserId}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CampaignComments({ campaignId, campaign }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModeration, setShowModeration] = useState(false);
  const [flagged, setFlagged] = useState([]);

  const currentUserId = user?.id || user?.userId;
  const isModerator =
    !!currentUserId && (String(campaign?.creator_id) === String(currentUserId) || user?.role === 'admin');

  function load() {
    setLoading(true);
    setError('');
    api
      .getCampaignComments(campaignId)
      .then(setComments)
      .catch((err) => setError(err.message || 'Could not load comments'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  useEffect(() => {
    if (!showModeration) return;
    api
      .getFlaggedCampaignComments(campaignId)
      .then(setFlagged)
      .catch(() => setFlagged([]));
  }, [showModeration, campaignId]);

  const { topLevel, repliesByParent } = useMemo(() => {
    const top = [];
    const byParent = {};
    for (const comment of comments) {
      if (comment.parent_id) {
        byParent[comment.parent_id] = byParent[comment.parent_id] || [];
        byParent[comment.parent_id].push(comment);
      } else {
        top.push(comment);
      }
    }
    return { topLevel: top, repliesByParent: byParent };
  }, [comments]);

  async function postTopLevel(body) {
    await api.postCampaignComment(campaignId, { body });
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Comments ({comments.filter((c) => !c.hidden).length})</h3>
        {isModerator && (
          <button type="button" onClick={() => setShowModeration((v) => !v)} style={{ fontSize: '0.8rem' }}>
            {showModeration ? 'Hide moderation queue' : `Moderation queue`}
          </button>
        )}
      </div>

      {showModeration && (
        <div
          style={{
            marginTop: '0.6rem',
            padding: '0.6rem',
            borderRadius: '8px',
            background: 'var(--color-warning-bg, #fffbeb)',
            border: '1px solid var(--color-warning-border, #fde68a)',
          }}
        >
          <strong style={{ fontSize: '0.82rem' }}>Flagged / hidden comments</strong>
          {flagged.length === 0 ? (
            <p style={{ fontSize: '0.8rem', margin: '0.3rem 0 0' }}>Nothing needs review.</p>
          ) : (
            flagged.map((c) => (
              <div key={c.id} style={{ fontSize: '0.8rem', marginTop: '0.4rem' }}>
                <strong>{c.author_name}</strong> ({c.flag_count} flag{c.flag_count !== 1 ? 's' : ''}
                {c.hidden ? ', hidden' : ''}): {c.body}
              </div>
            ))
          )}
        </div>
      )}

      {currentUserId && (
        <CommentComposer placeholder="Ask a question or leave a comment…" submitLabel="Post comment" onSubmit={postTopLevel} />
      )}

      {loading && <p style={{ color: 'var(--color-text-hint)', fontSize: '0.85rem' }}>Loading comments…</p>}
      {error && (
        <p className="alert alert--error" style={{ fontSize: '0.82rem' }}>
          {error}
        </p>
      )}

      {!loading && topLevel.length === 0 && (
        <p style={{ color: 'var(--color-text-hint)', fontSize: '0.85rem' }}>No comments yet.</p>
      )}

      <div>
        {topLevel.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            replies={repliesByParent[comment.id] || []}
            campaignId={campaignId}
            isModerator={isModerator}
            currentUserId={currentUserId}
            onChanged={load}
          />
        ))}
      </div>
    </div>
  );
}
