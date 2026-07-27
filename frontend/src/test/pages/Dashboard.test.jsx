import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import Dashboard from '../../pages/Dashboard';
import { renderWithProviders } from '../renderWithProviders';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user1', role: 'creator' },
    ready: true,
    updateUser: vi.fn(),
  }),
}));

const apiMocks = vi.hoisted(() => ({
  getMyBalance: vi.fn().mockResolvedValue({ balance: { USDC: '100' } }),
  getMe: vi.fn().mockResolvedValue({ id: 'user1', role: 'creator' }),
  getMyStats: vi.fn().mockResolvedValue({ total_campaigns: 1 }),
  getUserDashboardAnalytics: vi.fn().mockResolvedValue([]),
  getMyCampaigns: vi.fn().mockResolvedValue({ data: [], pagination: { totalPages: 1, total: 0 } }),
}));

vi.mock('../../services/api', () => ({ api: apiMocks }));

describe('Dashboard page', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dashboard heading and balance section', async () => {
    renderWithProviders(<Dashboard />);

    expect(await screen.findByRole('heading', { name: /Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Funds/i })).toBeInTheDocument();
  });

  it('shows an error message when the dashboard APIs fail', async () => {
    apiMocks.getMyStats.mockRejectedValueOnce(new Error('Dashboard failed'));

    renderWithProviders(<Dashboard />);

    await waitFor(() => expect(apiMocks.getMyStats).toHaveBeenCalled());
    expect(screen.getByText('Dashboard failed')).toBeInTheDocument();
  });
});
