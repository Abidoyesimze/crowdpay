import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import CampaignReferralsTab from '../../components/CampaignReferralsTab';
import { renderWithProviders } from '../renderWithProviders';

const apiMocks = vi.hoisted(() => ({
  getCampaignReferralCommissions: vi.fn(),
}));

vi.mock('../../services/api', () => ({ api: apiMocks }));

describe('CampaignReferralsTab', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders every referrer with referred totals and commission owed', async () => {
    apiMocks.getCampaignReferralCommissions.mockResolvedValue({
      program: { commission_percentage: 10, max_referrers: 20, referrer_count: 2 },
      referrers: [
        {
          referral_link_id: 'link-1',
          code: 'a1b2c3d4',
          referrer_name: 'Alice',
          contribution_count: 2,
          referred_amount: '600.0000000',
          commission_owed: '60.0000000',
        },
        {
          referral_link_id: 'link-2',
          code: 'e5f6g7h8',
          referrer_name: 'Bob',
          contribution_count: 1,
          referred_amount: '300.0000000',
          commission_owed: '30.0000000',
        },
      ],
    });

    renderWithProviders(<CampaignReferralsTab campaignId="camp-1" assetType="USDC" />);

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('60.0000000 USDC')).toBeInTheDocument();
    expect(screen.getByText(/2 of 20 referrer slots claimed/)).toBeInTheDocument();
  });

  it('prompts the creator to enable referrals when no program exists', async () => {
    const err = new Error('Not found');
    err.status = 404;
    apiMocks.getCampaignReferralCommissions.mockRejectedValue(err);

    renderWithProviders(<CampaignReferralsTab campaignId="camp-1" assetType="USDC" />);

    expect(await screen.findByText(/Referrals are not enabled/i)).toBeInTheDocument();
  });
});
