import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import CampaignCard from '../components/CampaignCard';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    api.getCampaigns()
      .then(setCampaigns)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="container" style={{ paddingTop: '2.5rem', paddingBottom: '4rem' }}>
      <div style={styles.hero}>
        <h1 style={styles.h1}>Fund anything, from anywhere.</h1>
        <p style={styles.sub}>
          CrowdPay settles contributions on Stellar — instant, cross-border, and in any currency.
        </p>
        {user ? (
          <Link to="/campaigns/new">
            <button className="btn-primary" style={{ fontSize: '1rem', padding: '0.75rem 1.75rem' }}>
              Start a campaign
            </button>
          </Link>
        ) : (
          <Link to="/register">
            <button className="btn-primary" style={{ fontSize: '1rem', padding: '0.75rem 1.75rem' }}>
              Get started
            </button>
          </Link>
        )}
      </div>

      <h2 style={styles.sectionTitle}>Active campaigns</h2>

      {loading ? (
        <p style={{ color: '#999' }}>Loading…</p>
      ) : campaigns.length === 0 ? (
        <p style={{ color: '#999' }}>No campaigns yet. Be the first.</p>
      ) : (
        <div style={styles.grid}>
          {campaigns.map((c) => <CampaignCard key={c.id} campaign={c} />)}
        </div>
      )}
    </main>
  );
}

const styles = {
  hero: { textAlign: 'center', padding: '3rem 0 3.5rem' },
  h1: { fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 800, marginBottom: '1rem', color: '#111' },
  sub: { fontSize: '1.1rem', color: '#555', marginBottom: '1.75rem', maxWidth: '500px', margin: '0 auto 1.75rem' },
  sectionTitle: { fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem', color: '#111' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' },
};
