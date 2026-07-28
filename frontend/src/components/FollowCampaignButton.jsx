import { useEffect, useState } from 'react';
import { api } from '../services/api';

export const FOLLOW_PREFERENCES = [
  { key: 'notify_updates', label: 'Campaign updates' },
  { key: 'notify_milestones', label: 'Milestone progress' },
  { key: 'notify_funding', label: 'Funding milestones' },
];

export default function FollowCampaignButton({ campaignId }) {
  const [follow, setFollow] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .getCampaignFollow(campaignId)
      .then((state) => {
        if (active) setFollow(state);
      })
      .catch(() => {
        if (active) setFollow({ following: false, follower_count: 0 });
      });
    return () => {
      active = false;
    };
  }, [campaignId]);

  async function toggleFollow() {
    setBusy(true);
    setError('');
    try {
      if (follow?.following) {
        await api.unfollowCampaign(campaignId);
        setFollow((prev) => ({
          ...prev,
          following: false,
          follower_count: Math.max(0, (prev?.follower_count || 1) - 1),
        }));
        setShowPreferences(false);
      } else {
        const next = await api.followCampaign(campaignId);
        setFollow(next);
      }
    } catch (err) {
      setError(err.message || 'Could not update follow status');
    } finally {
      setBusy(false);
    }
  }

  async function togglePreference(key) {
    const next = !follow[key];
    setFollow((prev) => ({ ...prev, [key]: next }));
    try {
      await api.updateCampaignFollow(campaignId, { [key]: next });
    } catch (err) {
      setFollow((prev) => ({ ...prev, [key]: !next }));
      setError(err.message || 'Could not save notification preference');
    }
  }

  if (!follow) return null;

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.35rem' }}>
      <span style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
        <button
          type="button"
          onClick={toggleFollow}
          disabled={busy}
          aria-pressed={follow.following}
          title={follow.following ? 'Stop following this campaign' : 'Follow this campaign'}
          style={{
            background: 'none',
            border: '1px solid var(--color-border-lighter)',
            borderRadius: '999px',
            fontSize: '0.85rem',
            padding: '0.2rem 0.6rem',
            cursor: 'pointer',
            color: follow.following ? 'var(--color-accent)' : 'var(--color-text-hint)',
          }}
        >
          {follow.following ? '🔔 Following' : '🔕 Follow'}
          {follow.follower_count > 0 && ` (${follow.follower_count})`}
        </button>
        {follow.following && (
          <button
            type="button"
            onClick={() => setShowPreferences((open) => !open)}
            aria-expanded={showPreferences}
            aria-label="Notification preferences for this campaign"
            style={{
              background: 'none',
              border: '1px solid var(--color-border-lighter)',
              borderRadius: '999px',
              fontSize: '0.85rem',
              padding: '0.2rem 0.5rem',
              cursor: 'pointer',
              color: 'var(--color-text-hint)',
            }}
          >
            ⚙
          </button>
        )}
      </span>

      {follow.following && showPreferences && (
        <span
          style={{
            display: 'grid',
            gap: '0.25rem',
            padding: '0.5rem 0.65rem',
            border: '1px solid var(--color-border-lighter)',
            borderRadius: '8px',
            fontSize: '0.8rem',
          }}
        >
          <strong style={{ fontSize: '0.78rem' }}>Notify me about</strong>
          {FOLLOW_PREFERENCES.map((preference) => (
            <label
              key={preference.key}
              style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={Boolean(follow[preference.key])}
                onChange={() => togglePreference(preference.key)}
                style={{ width: 'auto', margin: 0 }}
              />
              {preference.label}
            </label>
          ))}
        </span>
      )}

      {error && (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-status-error)' }}>{error}</span>
      )}
    </span>
  );
}
