import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import MyContributions from '../../pages/MyContributions';
import { renderWithProviders } from '../renderWithProviders';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user1' }, token: 'token', ready: true }),
}));

const apiMocks = vi.hoisted(() => ({
  getMyContributions: vi.fn().mockResolvedValue([
    {
      id: 'c1',
      campaign_id: 'campaign-1',
      campaign_title: 'Support project',
      campaign_status: 'active',
      amount: '100',
      asset: 'XLM',
      created_at: '2024-01-01T00:00:00.000Z',
      tx_hash: 'ABC12345XYZ',
    },
  ]),
}));

vi.mock('../../services/api', () => ({ api: apiMocks }));

describe('MyContributions page', () => {
  it('renders contribution records from the API', async () => {
    renderWithProviders(<MyContributions />);

    expect(await screen.findByRole('heading', { name: /My Contributions/i })).toBeInTheDocument();
    expect(screen.getByText(/Support project/i)).toBeInTheDocument();
    expect(screen.getByText(/100 XLM/i)).toBeInTheDocument();
  });
});
