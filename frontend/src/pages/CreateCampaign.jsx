import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function CreateCampaign() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', description: '', target_amount: '', asset_type: 'USDC', deadline: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const campaign = await api.createCampaign(form, token);
      navigate(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <main className="container" style={{ paddingTop: '2.5rem', maxWidth: '560px' }}>
      <h1 style={styles.title}>Start a campaign</h1>
      <p style={styles.sub}>A Stellar wallet will be created for your campaign automatically.</p>

      <form onSubmit={handleSubmit} style={styles.form}>
        <label style={styles.label}>Title</label>
        <input value={form.title} onChange={set('title')} placeholder="Campaign title" required style={{ marginBottom: '1rem' }} />

        <label style={styles.label}>Description</label>
        <textarea value={form.description} onChange={set('description')} rows={4} placeholder="What are you raising funds for?" style={{ marginBottom: '1rem', resize: 'vertical' }} />

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Target amount</label>
            <input type="number" min="1" step="any" value={form.target_amount} onChange={set('target_amount')} placeholder="0.00" required style={{ marginBottom: '1rem' }} />
          </div>
          <div style={{ width: '130px' }}>
            <label style={styles.label}>Asset</label>
            <select value={form.asset_type} onChange={set('asset_type')} style={{ marginBottom: '1rem' }}>
              <option value="USDC">USDC</option>
              <option value="XLM">XLM</option>
            </select>
          </div>
        </div>

        <label style={styles.label}>Deadline (optional)</label>
        <input type="date" value={form.deadline} onChange={set('deadline')} style={{ marginBottom: '1.5rem' }} />

        {error && <p style={styles.error}>{error}</p>}

        <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '0.85rem', fontSize: '1rem' }}>
          {loading ? 'Creating wallet…' : 'Launch campaign'}
        </button>
      </form>
    </main>
  );
}

const styles = {
  title: { fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.4rem' },
  sub: { color: '#666', marginBottom: '1.75rem', fontSize: '0.95rem' },
  form: { display: 'flex', flexDirection: 'column' },
  label: { fontSize: '0.85rem', fontWeight: 600, color: '#444', marginBottom: '0.3rem' },
  row: { display: 'flex', gap: '1rem' },
  error: { color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' },
};
