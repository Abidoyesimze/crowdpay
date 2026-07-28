import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';

const CHANNELS = [
  { id: 'email', label: 'Email', icon: '✉' },
  { id: 'push', label: 'Push', icon: '🔔' },
  { id: 'in_app', label: 'In-app', icon: '💬' },
];

const EVENT_TYPES = [
  { id: 'campaign_update', label: 'Campaign updates', description: 'New updates posted on campaigns you support' },
  { id: 'milestone_completion', label: 'Milestone completions', description: 'Milestones reached or approved' },
  { id: 'funds_released', label: 'Fund release transparency', description: 'When backed campaign funds are released with usage details' },
  { id: 'withdrawal', label: 'Withdrawal notifications', description: 'Withdrawal requests, approvals, and rejections' },
  { id: 'dispute', label: 'Dispute notifications', description: 'Disputes opened, updated, or resolved' },
  { id: 'referral_reward', label: 'Referral rewards', description: 'When a referral contribution is confirmed' },
  { id: 'weekly_digest', label: 'Weekly digest', description: 'A summary of activity delivered once a week' },
];

function formatHour(h) {
  if (h === null || h === undefined) return '';
  const hour = Number(h);
  if (isNaN(hour)) return '';
  const period = hour >= 12 ? 'PM' : 'AM';
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:00 ${period}`;
}

function Toggle({ checked, onChange, disabled, label, id }) {
  return (
    <label className="notif-toggle" htmlFor={id}>
      <span className="notif-toggle__label">{label}</span>
      <span
        className={`notif-toggle__track${checked ? ' notif-toggle__track--on' : ''}`}
        aria-hidden="true"
      >
        <span className="notif-toggle__thumb" />
      </span>
      <input
        id={id}
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="notif-toggle__input"
      />
    </label>
  );
}

function SectionCard({ title, description, children }) {
  return (
    <div className="campaign-card notif-settings__card">
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.25rem' }}>{title}</h2>
        {description && (
          <p style={{ color: 'var(--color-text-hint)', fontSize: '0.875rem', margin: 0 }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

export default function NotificationSettings() {
  const { user, ready } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Channel-level enabled flags (derived from preferences)
  const [channelEnabled, setChannelEnabled] = useState({ email: true, push: true, in_app: true });

  // Quiet hours
  const [quietStart, setQuietStart] = useState('');
  const [quietEnd, setQuietEnd] = useState('');
  const [quietEnabled, setQuietEnabled] = useState(false);

  // Per-event-type per-channel preferences: { [eventType]: { [channel]: boolean } }
  const [prefs, setPrefs] = useState({});

  // Per-campaign overrides
  const [campaigns, setCampaigns] = useState([]);
  const [campaignOverrides, setCampaignOverrides] = useState({});
  const [showCampaignSection, setShowCampaignSection] = useState(false);

  const loadPreferences = useCallback(async () => {
    try {
      const [prefRows, channelSettings, myCampaigns] = await Promise.all([
        api.getNotificationPreferences().catch(() => []),
        api.getChannelSettings().catch(() => ({})),
        api.getMyCampaigns({ limit: 50 }).catch(() => ({ campaigns: [] })),
      ]);

      // Build preference map from rows
      const prefMap = {};
      if (Array.isArray(prefRows)) {
        for (const row of prefRows) {
          if (!prefMap[row.event_type]) prefMap[row.event_type] = {};
          prefMap[row.event_type][row.channel] = row.enabled;
        }
      }
      setPrefs(prefMap);

      // Derive channel-level enabled from the "campaign_update" event as a proxy,
      // or default to true if no preferences exist yet
      const chEnabled = {};
      for (const ch of CHANNELS) {
        const proxyEvent = prefMap['campaign_update'];
        if (proxyEvent && proxyEvent[ch.id] !== undefined) {
          chEnabled[ch.id] = proxyEvent[ch.id];
        } else {
          chEnabled[ch.id] = true;
        }
      }
      setChannelEnabled(chEnabled);

      // Quiet hours from channel settings
      const qs = channelSettings?.quiet_hours_start;
      const qe = channelSettings?.quiet_hours_end;
      if (qs !== null && qs !== undefined && qe !== null && qe !== undefined) {
        setQuietEnabled(true);
        setQuietStart(String(qs));
        setQuietEnd(String(qe));
      }

      // Campaigns for per-campaign overrides
      const campList = (myCampaigns?.campaigns || []).filter(
        (c) => c.status === 'active' || c.status === 'funded'
      );
      setCampaigns(campList);

      // Build campaign override map from preferences
      const overrides = {};
      if (Array.isArray(prefRows)) {
        for (const row of prefRows) {
          if (row.event_type?.startsWith('campaign_') && row.event_type.includes(':')) {
            const campId = row.event_type.split(':').pop();
            if (!overrides[campId]) overrides[campId] = {};
            overrides[campId][row.channel] = row.enabled;
          }
        }
      }
      setCampaignOverrides(overrides);
    } catch (err) {
      toast(err.message || 'Failed to load notification settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const handleChannelToggle = useCallback(
    async (channelId, enabled) => {
      setChannelEnabled((prev) => ({ ...prev, [channelId]: enabled }));

      // Also toggle all event types for this channel
      setPrefs((prev) => {
        const next = { ...prev };
        for (const evt of EVENT_TYPES) {
          if (!next[evt.id]) next[evt.id] = {};
          next[evt.id] = { ...next[evt.id], [channelId]: enabled };
        }
        return next;
      });

      try {
        // Save each event type preference for this channel
        const promises = EVENT_TYPES.map((evt) =>
          api.updateNotificationPreference({
            event_type: evt.id,
            channel: channelId,
            enabled,
          })
        );
        await Promise.all(promises);
        toast(
          `${channelId === 'in_app' ? 'In-app' : channelId.charAt(0).toUpperCase() + channelId.slice(1)} notifications ${enabled ? 'enabled' : 'disabled'}`,
          'success'
        );
      } catch (err) {
        toast(err.message || 'Failed to update channel settings', 'error');
      }
    },
    [toast]
  );

  const handleEventTypeToggle = useCallback(
    async (eventTypeId, channelId, enabled) => {
      setPrefs((prev) => {
        const next = { ...prev };
        if (!next[eventTypeId]) next[eventTypeId] = {};
        next[eventTypeId] = { ...next[eventTypeId], [channelId]: enabled };
        return next;
      });

      try {
        await api.updateNotificationPreference({
          event_type: eventTypeId,
          channel: channelId,
          enabled,
        });
      } catch (err) {
        toast(err.message || 'Failed to save preference', 'error');
      }
    },
    [toast]
  );

  const handleQuietHoursSave = useCallback(async () => {
    if (quietEnabled && (quietStart === '' || quietEnd === '')) {
      toast('Please set both start and end times for quiet hours', 'error');
      return;
    }

    setSaving(true);
    try {
      await api.updateChannelSettings({
        quiet_hours_start: quietEnabled ? Number(quietStart) : null,
        quiet_hours_end: quietEnabled ? Number(quietEnd) : null,
      });
      toast('Quiet hours updated', 'success');
    } catch (err) {
      toast(err.message || 'Failed to save quiet hours', 'error');
    } finally {
      setSaving(false);
    }
  }, [quietEnabled, quietStart, quietEnd, toast]);

  const handleCampaignOverride = useCallback(
    async (campaignId, channelId, enabled) => {
      setCampaignOverrides((prev) => {
        const next = { ...prev };
        if (!next[campaignId]) next[campaignId] = {};
        next[campaignId] = { ...next[campaignId], [channelId]: enabled };
        return next;
      });

      try {
        await api.updateNotificationPreference({
          event_type: `campaign_override:${campaignId}`,
          channel: channelId,
          enabled,
        });
      } catch (err) {
        toast(err.message || 'Failed to save campaign override', 'error');
      }
    },
    [toast]
  );

  if (!ready) {
    return (
      <main className="container page-narrow" style={{ paddingTop: '3rem' }}>
        <p className="alert alert--info">Loading session…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="container page-narrow" style={{ paddingTop: '3rem' }}>
        <p className="alert alert--error">
          Please <Link to="/login" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>log in</Link> to manage notification settings.
        </p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="container page-narrow notif-settings" style={{ paddingTop: '3rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '1.5rem' }}>Notification Settings</h1>
        <div className="campaign-card">
          <p style={{ color: 'var(--color-text-hint)' }}>Loading your preferences…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container page-narrow notif-settings" style={{ paddingTop: '3rem', paddingBottom: '4rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link
          to="/profile"
          style={{ color: 'var(--color-text-hint)', fontSize: '0.875rem', fontWeight: 500 }}
        >
          ← Back to profile
        </Link>
      </div>

      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>
        Notification Settings
      </h1>
      <p style={{ color: 'var(--color-text-hint)', fontSize: '0.9rem', marginBottom: '2rem' }}>
        Control how and when you receive notifications from CrowdPay.
      </p>

      {/* ── Channel Toggles ─────────────────────────────────── */}
      <SectionCard
        title="Notification channels"
        description="Turn entire channels on or off. Disabling a channel silences all notifications delivered through it."
      >
        <div className="notif-settings__channel-list">
          {CHANNELS.map((ch) => (
            <div key={ch.id} className="notif-settings__channel-row">
              <div className="notif-settings__channel-info">
                <span className="notif-settings__channel-icon" aria-hidden="true">{ch.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{ch.label}</div>
                  <div style={{ color: 'var(--color-text-hint)', fontSize: '0.8rem' }}>
                    {ch.id === 'email'
                      ? 'Delivered to your email address'
                      : ch.id === 'push'
                        ? 'Browser and mobile push alerts'
                        : 'Shown in the CrowdPay notification center'}
                  </div>
                </div>
              </div>
              <Toggle
                id={`channel-${ch.id}`}
                checked={channelEnabled[ch.id]}
                onChange={(enabled) => handleChannelToggle(ch.id, enabled)}
                label={`Toggle ${ch.label}`}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Quiet Hours ─────────────────────────────────────── */}
      <SectionCard
        title="Quiet hours"
        description="Pause non-critical notifications during specific hours. Critical alerts (disputes, withdrawals) are always delivered."
      >
        <Toggle
          id="quiet-hours-toggle"
          checked={quietEnabled}
          onChange={setQuietEnabled}
          label="Enable quiet hours"
        />
        {quietEnabled && (
          <div className="notif-settings__quiet-form">
            <div className="notif-settings__time-group">
              <label htmlFor="quiet-start" className="label-strong" style={{ fontSize: '0.875rem' }}>
                Start time
              </label>
              <select
                id="quiet-start"
                value={quietStart}
                onChange={(e) => setQuietStart(e.target.value)}
                style={{ maxWidth: '160px' }}
              >
                <option value="">Select…</option>
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {formatHour(i)}
                  </option>
                ))}
              </select>
            </div>
            <div className="notif-settings__time-group">
              <label htmlFor="quiet-end" className="label-strong" style={{ fontSize: '0.875rem' }}>
                End time
              </label>
              <select
                id="quiet-end"
                value={quietEnd}
                onChange={(e) => setQuietEnd(e.target.value)}
                style={{ maxWidth: '160px' }}
              >
                <option value="">Select…</option>
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {formatHour(i)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={handleQuietHoursSave}
              disabled={saving}
              style={{ marginTop: '0.5rem', alignSelf: 'flex-start' }}
            >
              {saving ? 'Saving…' : 'Save quiet hours'}
            </button>
          </div>
        )}
      </SectionCard>

      {/* ── Notification Types ──────────────────────────────── */}
      <SectionCard
        title="Notification types"
        description="Choose which events trigger notifications and on which channels."
      >
        <div className="notif-settings__types-table">
          <div className="notif-settings__types-header">
            <span className="notif-settings__types-label">Event</span>
            <div className="notif-settings__types-channels">
              {CHANNELS.filter((ch) => channelEnabled[ch.id]).map((ch) => (
                <span key={ch.id} className="notif-settings__types-ch-label" title={ch.label}>
                  {ch.icon}
                </span>
              ))}
            </div>
          </div>

          {EVENT_TYPES.map((evt) => {
            const evtPrefs = prefs[evt.id] || {};
            return (
              <div key={evt.id} className="notif-settings__types-row">
                <div className="notif-settings__types-info">
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{evt.label}</span>
                  <span style={{ color: 'var(--color-text-hint)', fontSize: '0.8rem' }}>
                    {evt.description}
                  </span>
                </div>
                <div className="notif-settings__types-channels">
                  {CHANNELS.filter((ch) => channelEnabled[ch.id]).map((ch) => (
                    <Toggle
                      key={ch.id}
                      id={`pref-${evt.id}-${ch.id}`}
                      checked={evtPrefs[ch.id] !== false}
                      onChange={(enabled) => handleEventTypeToggle(evt.id, ch.id, enabled)}
                      label={`${evt.label} via ${ch.label}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* ── Per-Campaign Overrides ──────────────────────────── */}
      {campaigns.length > 0 && (
        <SectionCard
          title="Campaign overrides"
          description="Override notification settings for individual campaigns you manage."
        >
          {!showCampaignSection ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowCampaignSection(true)}
              style={{ alignSelf: 'flex-start' }}
            >
              Configure campaign overrides
            </button>
          ) : (
            <div className="notif-settings__campaign-list">
              {campaigns.map((camp) => {
                const overrides = campaignOverrides[camp.id] || {};
                return (
                  <div key={camp.id} className="notif-settings__campaign-item">
                    <div className="notif-settings__campaign-info">
                      <Link
                        to={`/campaigns/${camp.id}`}
                        style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-accent)' }}
                      >
                        {camp.title}
                      </Link>
                      <span style={{ color: 'var(--color-text-hint)', fontSize: '0.8rem' }}>
                        {camp.status} · ${Number(camp.raised_amount || 0).toLocaleString()} raised
                      </span>
                    </div>
                    <div className="notif-settings__campaign-toggles">
                      {CHANNELS.filter((ch) => channelEnabled[ch.id]).map((ch) => (
                        <Toggle
                          key={ch.id}
                          id={`camp-${camp.id}-${ch.id}`}
                          checked={overrides[ch.id] !== false}
                          onChange={(enabled) => handleCampaignOverride(camp.id, ch.id, enabled)}
                          label={`${ch.label} for ${camp.title}`}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}
    </main>
  );
}
