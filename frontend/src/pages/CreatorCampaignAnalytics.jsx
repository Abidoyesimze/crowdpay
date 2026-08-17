import React, { useEffect, useState, useCallback } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';

const DONUT_COLORS = ['#7c3aed', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6'];

function StatCard({ label, value }) {
  return (
    <div className="campaign-card" style={{ minHeight: 'auto', padding: '0.6rem 0.75rem' }}>
      <strong style={{ fontSize: '1rem' }}>{value}</strong>
      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-hint)' }}>{label}</div>
    </div>
  );
}

export default function CreatorCampaignAnalytics() {
  const { campaignId } = useParams();
  const { user, ready } = useAuth();
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const isCreator = user?.role === 'creator' || user?.role === 'admin';

  useEffect(() => {
    if (!user || !isCreator || !campaignId) return;
    setLoading(true);
    api
      .getCreatorCampaignAnalytics(campaignId)
      .then(setData)
      .catch((err) => setError(err.message || 'Failed to load campaign analytics'))
      .finally(() => setLoading(false));
  }, [user, isCreator, campaignId]);

  const handleExport = useCallback(async () => {
    if (!campaignId) return;
    setExporting(true);
    setError('');
    try {
      const { blob, filename } = await api.exportCreatorCampaignData(campaignId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err.status === 429) {
        setError('Daily export limit reached (5/day). Try again tomorrow.');
      } else {
        setError(err.message || 'Export failed');
      }
    } finally {
      setExporting(false);
    }
  }, [campaignId]);

  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isCreator) return <Navigate to="/dashboard" replace />;

  const retention = data?.contributor_retention;
  const retentionData = retention
    ? [
        { name: 'New', value: retention.new },
        { name: 'Returning', value: retention.returning },
      ]
    : [];

  const assetMixData = (data?.asset_mix || []).map((a) => ({
    name: a.asset,
    value: Number(a.total),
    count: a.count,
  }));

  const milestonesData = (data?.milestones || []).map((m) => ({
    name: m.title,
    progress: m.progress_pct,
    target: m.percentage,
    status: m.status,
  }));

  return (
    <main className="container" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>
          {data?.campaign?.title || 'Campaign Analytics'}
        </h1>
        <Link to="/dashboard/analytics" style={{ color: 'var(--color-accent)', fontWeight: 600, fontSize: '0.9rem' }}>
          ← Back to Analytics
        </Link>
      </div>

      {error && <p className="alert alert--error">{error}</p>}
      {loading && <p style={{ color: 'var(--color-text-hint)' }}>{t('common.loading')}</p>}

      {data && !loading && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <StatCard label="Raised" value={`${Number(data.campaign.raised_amount).toLocaleString()} ${data.campaign.asset_type}`} />
            <StatCard label="Target" value={`${Number(data.campaign.target_amount).toLocaleString()} ${data.campaign.asset_type}`} />
            <StatCard label="Goal %" value={`${Number(data.campaign.target_amount) > 0 ? Math.min(100, (Number(data.campaign.raised_amount) / Number(data.campaign.target_amount)) * 100).toFixed(1) : 0}%`} />
            <StatCard label="Contributors" value={retention?.total || 0} />
            <StatCard label="Retention Rate" value={`${retention?.retention_rate || 0}%`} />
            {data.median_time_to_first_contribution_hours !== null && data.median_time_to_first_contribution_hours !== undefined && (
              <StatCard label="Time to First Contribution" value={`${data.median_time_to_first_contribution_hours}h`} />
            )}
          </div>

          <div className="campaign-card" style={{ minHeight: 'auto', marginBottom: '1.25rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.6rem' }}>Hourly Contribution Trend (Last 30 Days)</strong>
            {data.hourly_trend?.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={data.hourly_trend} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(d) => d?.slice(5, 16)}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 11 }} width={55} />
                  <Tooltip
                    formatter={(v, name) => [Number(v).toLocaleString(), name === 'total_amount' ? 'Amount' : 'Count']}
                    labelFormatter={(l) => l?.slice(0, 16)}
                  />
                  <Line type="monotone" dataKey="total_amount" stroke="var(--color-accent)" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: 'var(--color-text-hint)', fontSize: '0.9rem' }}>No contributions in the last 30 days.</p>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div className="campaign-card" style={{ minHeight: 'auto' }}>
              <strong style={{ display: 'block', marginBottom: '0.6rem' }}>Contributor Retention</strong>
              {retentionData.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={retentionData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {retentionData.map((_, i) => (
                        <Cell key={i} fill={DONUT_COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [v, 'Contributors']} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: 'var(--color-text-hint)', fontSize: '0.9rem' }}>No data yet.</p>
              )}
            </div>

            <div className="campaign-card" style={{ minHeight: 'auto' }}>
              <strong style={{ display: 'block', marginBottom: '0.6rem' }}>Asset Mix</strong>
              {assetMixData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={assetMixData} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={60} />
                    <Tooltip formatter={(v) => [Number(v).toLocaleString(), 'Total']} />
                    <Bar dataKey="value" fill="var(--color-accent)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: 'var(--color-text-hint)', fontSize: '0.9rem' }}>No data yet.</p>
              )}
            </div>
          </div>

          {milestonesData.length > 0 && (
            <div className="campaign-card" style={{ minHeight: 'auto', marginBottom: '1.25rem' }}>
              <strong style={{ display: 'block', marginBottom: '0.6rem' }}>Milestone Funnel</strong>
              {milestonesData.map((m, i) => (
                <div key={i} style={{ marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                    <span>{m.name}</span>
                    <span style={{ color: 'var(--color-text-hint)' }}>
                      {m.target}% · {m.progress.toFixed(0)}% funded · {m.status}
                    </span>
                  </div>
                  <div style={{ background: 'var(--color-surface)', borderRadius: 99, height: 6, marginTop: 3 }}>
                    <div
                      style={{
                        width: `${m.progress}%`,
                        height: 6,
                        borderRadius: 99,
                        background: m.status === 'released' ? '#22c55e' : 'var(--color-accent)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="campaign-card" style={{ minHeight: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <strong>Export Data</strong>
              <button
                type="button"
                className="btn-primary"
                disabled={exporting}
                onClick={handleExport}
                style={{ fontSize: '0.82rem', padding: '0.3rem 0.8rem' }}
              >
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-hint)', marginTop: '0.3rem' }}>
              Max 5 exports per day. Large exports ({'>'}10k rows) will be emailed.
            </p>
          </div>
        </>
      )}
    </main>
  );
}
