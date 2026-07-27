import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import Landing from '../../pages/Landing';
import { renderWithProviders } from '../renderWithProviders';

const apiMocks = vi.hoisted(() => ({
  getFeaturedCampaigns: vi.fn().mockResolvedValue([]),
  getCampaigns: vi.fn().mockResolvedValue({ campaigns: [], total: 0 }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: null, ready: true }),
}));

vi.mock('../../services/api', () => ({ api: apiMocks }));

describe('Landing page', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the landing heading and main call to action', async () => {
    renderWithProviders(<Landing />);

    expect(await screen.findByRole('heading', { name: /Support with Confidence/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Explore Support Spaces/i })).toBeInTheDocument();
  });
});
