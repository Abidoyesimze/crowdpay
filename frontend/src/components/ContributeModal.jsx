import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export default function ContributeModal({ campaign, onClose, onSuccess }) {
  const { token } = useAuth();
  const [amount, setAmount] = useState('');
  const [sendAsset, setSendAsset] = useState(campaign.asset_type);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    setLoading(true);
    setError('');
    try {
      await api.contribute({ campaign_id: campaign.id, amount, send_asset: sendAsset }, token);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const isPathPayment = sendAsset !== campaign.asset_type;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>Contribute to {campaign.title}</h2>

        {isPathPayment && (
          <div style={styles.notice}>
            Path payment active — you send {sendAsset}, campaign receives {campaign.asset_type} automatically via Stellar DEX.
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Send asset</label>
          <select value={sendAsset} onChange={(e) => setSendAsset(e.target.value)} style={{ marginBottom: '1rem' }}>
            <option value="XLM">XLM</option>
            <option value="USDC">USDC</option>
          </select>

          <label style={styles.label}>Amount ({sendAsset})</label>
          <input
            type="number"
            min="0.0000001"
            step="any"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ marginBottom: '1rem' }}
          />

          {error && <p style={styles.error}>{error}</p>}

          <div style={styles.actions}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Submitting…' : 'Contribute'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', borderRadius: '12px', padding: '2rem', width: '100%', maxWidth: '420px' },
  title: { fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem' },
  form: { display: 'flex', flexDirection: 'column' },
  label: { fontSize: '0.85rem', fontWeight: 600, color: '#444', marginBottom: '0.3rem' },
  notice: { background: '#ede9fe', color: '#5b21b6', borderRadius: '6px', padding: '0.65rem 0.85rem', fontSize: '0.82rem', marginBottom: '1rem' },
  actions: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' },
  error: { color: '#dc2626', fontSize: '0.85rem', marginBottom: '0.75rem' },
};
