import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import ContributeModal from '../components/ContributeModal';

export default function Campaign() {
  const { id } = useParams();
  const { user, token } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [contributions, setContributions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [contributed, setContributed] = useState(false);

  useEffect(() => {
    api.getCampaign(id).then(setCampaign).catch(console.error);
    api.getContributions(id).then(setContributions).catch(console.error);
  }, [id, contributed]);

  if (!campaign) return <p style={{ padding: '3rem', color: '#999' }}>Loading…</p>;

  const pct = Math.min(100, (campaign.raised_amount / campaign.target_amount) * 100).toFixed(1);

  return (
    <main className="container" style={{ paddingTop: '2.5rem', paddingBottom: '4rem', maxWidth: '760px' }}>
      <div style={styles.header}>
        <span style={styles.asset}>{campaign.asset_type}</span>
        <h1 style={styles.title}>{campaign.title}</h1>
        <p style={styles.desc}>{campaign.description}</p>
      </div>

      <div style={styles.card}>
        <div style={styles.amounts}>
          <div>
            <div style={styles.big}>{Number(campaign.raised_amount).toLocaleString()} {campaign.asset_type}</div>
            <div style={styles.small}>raised of {Number(campaign.target_amount).toLocaleString()} goal</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={styles.big}>{pct}%</div>
            <div style={styles.small}>funded</div>
          </div>
        </div>
        <div style={styles.bar}><div style={{ ...styles.fill, width: `${pct}%` }} /></div>

        {user ? (
          <button className="btn-primary" style={styles.cta} onClick={() => setShowModal(true)}>
            Contribute
          </button>
        ) : (
          <p style={{ color: '#777', fontSize: '0.9rem' }}>Log in to contribute.</p>
        )}
      </div>

      <div style={styles.walletInfo}>
        <span style={styles.walletLabel}>Campaign wallet</span>
        <code style={styles.walletKey}>{campaign.wallet_public_key}</code>
      </div>

      <h2 style={styles.sectionTitle}>Contributions ({contributions.length})</h2>
      {contributions.length === 0 ? (
        <p style={{ color: '#999' }}>No contributions yet.</p>
      ) : (
        <div style={styles.list}>
          {contributions.map((c) => (
            <div key={c.id} style={styles.row}>
              <span style={styles.sender}>{c.sender_public_key.slice(0, 8)}…{c.sender_public_key.slice(-4)}</span>
              <span style={styles.amount}>{Number(c.amount).toLocaleString()} {c.asset}</span>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ContributeModal
          campaign={campaign}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); setContributed((v) => !v); }}
        />
      )}
    </main>
  );
}

const styles = {
  header: { marginBottom: '1.5rem' },
  asset: { background: '#ede9fe', color: '#7c3aed', fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '99px' },
  title: { fontSize: '1.8rem', fontWeight: 800, margin: '0.5rem 0', color: '#111' },
  desc: { color: '#555', fontSize: '1rem', lineHeight: 1.6 },
  card: { background: '#fff', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '1.5rem', marginBottom: '1rem' },
  amounts: { display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' },
  big: { fontSize: '1.5rem', fontWeight: 800, color: '#111' },
  small: { fontSize: '0.85rem', color: '#888' },
  bar: { background: '#f0f0f0', borderRadius: '99px', height: '8px', marginBottom: '1.25rem', overflow: 'hidden' },
  fill: { background: '#7c3aed', height: '100%', borderRadius: '99px' },
  cta: { width: '100%', padding: '0.85rem', fontSize: '1rem' },
  walletInfo: { background: '#f8f8f8', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  walletLabel: { fontSize: '0.75rem', fontWeight: 600, color: '#888', textTransform: 'uppercase' },
  walletKey: { fontSize: '0.8rem', color: '#555', wordBreak: 'break-all' },
  sectionTitle: { fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  row: { display: 'flex', justifyContent: 'space-between', background: '#fff', border: '1px solid #eee', borderRadius: '6px', padding: '0.6rem 0.85rem' },
  sender: { fontSize: '0.85rem', color: '#555', fontFamily: 'monospace' },
  amount: { fontSize: '0.85rem', fontWeight: 600 },
};
