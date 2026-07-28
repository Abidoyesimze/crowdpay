import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders';
import ContributorBadges from '../../components/ContributorBadges';

vi.mock('../../services/api', () => ({
  api: { getMyBadges: vi.fn() },
}));

import { api } from '../../services/api';

const BADGES = [
  {
    id: 'first_contribution',
    label: 'First contribution',
    description: 'Backed your first campaign.',
    earned: true,
    earned_at: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'early_backer',
    label: 'Early backer',
    description: 'Among the first 10 backers of a campaign.',
    earned: true,
    earned_at: '2026-07-02T00:00:00.000Z',
  },
  {
    id: 'milestone_witness',
    label: 'Milestone witness',
    description: 'Backed a campaign that has released a milestone.',
    earned: false,
    earned_at: null,
  },
];

describe('ContributorBadges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows how many badges have been earned and links to the leaderboard', async () => {
    api.getMyBadges.mockResolvedValue(BADGES);

    renderWithProviders(<ContributorBadges />);

    expect(await screen.findByText('Badges (2/3)')).toBeInTheDocument();
    expect(screen.getByText('Early backer')).toBeInTheDocument();
    expect(screen.getByText('Milestone witness')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View leaderboard/i })).toHaveAttribute(
      'href',
      '/leaderboard'
    );
  });

  it('surfaces a load failure', async () => {
    api.getMyBadges.mockRejectedValue(new Error('Server unavailable'));

    renderWithProviders(<ContributorBadges />);

    expect(await screen.findByText('Server unavailable')).toBeInTheDocument();
  });
});
