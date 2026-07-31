import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { stellarExpertTxUrl } from '../config/stellar';

function downloadBlob({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function TaxReceipts() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .getTaxReceipts()
      .then((data) => {
        if (active) setReceipts(data.receipts || []);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Could not load tax receipts');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function downloadAll() {
    setDownloading('all');
    setError('');
    try {
      downloadBlob(await api.downloadTaxReceiptsPdf());
    } catch (err) {
      setError(err.message || 'Could not download receipts');
    } finally {
      setDownloading('');
    }
  }

  async function downloadOne(id) {
    setDownloading(id);
    setError('');
    try {
      downloadBlob(await api.downloadTaxReceiptPdf(id));
    } catch (err) {
      setError(err.message || 'Could not download receipt');
    } finally {
      setDownloading('');
    }
  }

  return (
    <main className="container" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>Tax receipts</h1>
          <p style={{ color: 'var(--color-text-secondary)', margin: '0.35rem 0 0' }}>
            Download contribution receipts for your records.
          </p>
        </div>
        {receipts.length > 0 && (
          <button
            type="button"
            className="btn-primary"
            disabled={downloading === 'all'}
            onClick={downloadAll}
          >
            {downloading === 'all' ? 'Preparing...' : 'Download all PDFs'}
          </button>
        )}
      </div>

      {error && <p className="alert alert--error">{error}</p>}

      {loading ? (
        <p style={{ color: 'var(--color-text-hint)' }}>Loading receipts...</p>
      ) : receipts.length === 0 ? (
        <p className="alert alert--info">
          No contribution receipts are available yet.{' '}
          <Link to="/discover" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
            Browse campaigns
          </Link>
          .
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {receipts.map((receipt) => (
            <article key={receipt.id} className="campaign-card" style={{ minHeight: 'auto' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <Link
                    to={`/campaigns/${receipt.campaign_id}`}
                    style={{ color: 'var(--color-accent)', fontWeight: 700 }}
                  >
                    {receipt.campaign_title}
                  </Link>
                  <div style={{ marginTop: '0.35rem', color: 'var(--color-text-primary)' }}>
                    {Number(receipt.amount).toLocaleString()} {receipt.asset}
                  </div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--color-text-secondary)' }}>
                    {new Date(receipt.created_at).toLocaleString()} | {receipt.campaign_status}
                  </div>
                  {receipt.tx_hash && (
                    <a
                      href={stellarExpertTxUrl(receipt.tx_hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: 'var(--color-accent)',
                        display: 'inline-block',
                        fontSize: '0.84rem',
                        marginTop: '0.35rem',
                      }}
                    >
                      View transaction
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  disabled={downloading === receipt.id}
                  onClick={() => downloadOne(receipt.id)}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {downloading === receipt.id ? 'Preparing...' : 'Download PDF'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
