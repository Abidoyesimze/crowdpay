import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import CampaignQRCode from '../components/CampaignQRCode';

function shareTexts(campaignTitle, shareUrl) {
  return {
    twitter: `Backing ${campaignTitle} on CrowdPay — funded transparently on Stellar. Join me: ${shareUrl}`,
    whatsapp: `Hey! I'm supporting ${campaignTitle} on CrowdPay. Every contribution settles on Stellar in seconds — take a look: ${shareUrl}`,
    telegram: `${campaignTitle} is raising funds on CrowdPay, built on Stellar. Here's the link: ${shareUrl}`,
  };
}

export default function CampaignShare() {
  const { id } = useParams();
  const { user, ready } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [program, setProgram] = useState(null);
  const [link, setLink] = useState(null);
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!id) return;
    api.getCampaign(id).then(setCampaign).catch(() => setCampaign(null));
    api.getReferralProgram(id).then(setProgram).catch(() => setProgram(null));
  }, [id]);

  const claimLink = useCallback(async () => {
    setClaiming(true);
    setError('');
    try {
      setLink(await api.createReferralLink(id));
    } catch (err) {
      setError(
        err.message === 'REFERRER_LIMIT_REACHED'
          ? 'This campaign has reached its referrer limit.'
          : err.message || 'Could not create your referral link'
      );
    } finally {
      setClaiming(false);
    }
  }, [id]);

  const copy = useCallback(async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setError('Could not copy to clipboard');
    }
  }, []);

  if (!ready) return null;

  const campaignUrl = `${window.location.origin}/campaigns/${id}`;
  const shareUrl = link?.shareUrl || campaignUrl;
  const texts = shareTexts(campaign?.title || 'this campaign', shareUrl);

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Share {campaign?.title || 'campaign'}</h1>
      <p style={{ color: 'var(--color-text-muted)', marginTop: 0 }}>
        {program
          ? `Referrers earn ${Number(program.commission_percentage)}% of every contribution made through their link.`
          : 'Share this campaign with your network.'}
      </p>

      {program && !link && (
        <div className="campaign-card" style={{ marginBottom: '1.25rem' }}>
          {user ? (
            <>
              <p style={{ marginTop: 0 }}>
                Claim your personal referral link to earn commission on the contributions you bring in.
              </p>
              <button type="button" className="btn-primary" onClick={claimLink} disabled={claiming}>
                {claiming ? 'Creating…' : 'Get my referral link'}
              </button>
            </>
          ) : (
            <p style={{ margin: 0 }}>
              <Link to="/login">Log in</Link> to claim a referral link for this campaign.
            </p>
          )}
        </div>
      )}

      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}

      <div className="campaign-card" style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <strong>{link ? 'Your referral link' : 'Campaign link'}</strong>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            readOnly
            value={shareUrl}
            aria-label="Share URL"
            style={{ flex: '1 1 20rem', padding: '0.45rem 0.6rem', fontFamily: 'monospace', fontSize: '0.82rem' }}
          />
          <button type="button" className="btn-secondary" onClick={() => copy(shareUrl, 'url')}>
            {copied === 'url' ? 'Copied!' : 'Copy link'}
          </button>
        </div>
        {link && (
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-hint)' }}>
            Referral code <code>{link.code}</code> — recorded in the Stellar memo of every contribution
            made through this link.
          </span>
        )}
      </div>

      <div className="campaign-card" style={{ marginBottom: '1.25rem' }}>
        <strong style={{ display: 'block', marginBottom: '0.75rem' }}>QR code</strong>
        <CampaignQRCode url={shareUrl} />
      </div>

      <div className="campaign-card" style={{ display: 'grid', gap: '1rem' }}>
        <strong>Ready-to-post messages</strong>

        {[
          { key: 'twitter', label: 'X / Twitter', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(texts.twitter)}` },
          { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(texts.whatsapp)}` },
          { key: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(texts.telegram)}` },
        ].map((channel) => (
          <div key={channel.key} style={{ display: 'grid', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{channel.label}</span>
            <textarea
              readOnly
              rows={3}
              value={texts[channel.key]}
              aria-label={`${channel.label} share text`}
              style={{ width: '100%', padding: '0.5rem', fontSize: '0.82rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => copy(texts[channel.key], channel.key)}
              >
                {copied === channel.key ? 'Copied!' : 'Copy text'}
              </button>
              <a
                className="btn-secondary"
                href={channel.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => api.trackShare(id, channel.key).catch(() => {})}
              >
                Share on {channel.label}
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
