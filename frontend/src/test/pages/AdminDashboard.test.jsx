import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import AdminDashboard from '../../pages/AdminDashboard';
import { renderWithProviders } from '../renderWithProviders';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin', role: 'admin', is_admin: true }, ready: true }),
}));

const apiMocks = vi.hoisted(() => ({
  getAdminHealth: vi.fn().mockResolvedValue({
    active_campaigns: 3,
    total_raised: '5000',
    pending_withdrawals: { count: 1, total_value: '200' },
    open_disputes: 0,
    failed_webhook_deliveries: 0,
    stellar: { network: 'Testnet', current_ledger: 12345, base_fee_stroops: 100, horizon_latency_ms: 50 },
    load_time_ms: 12,
    recent_reconciliation_runs: [],
  }),
  getAdminWebhookDeliveries: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../services/api', () => ({ api: apiMocks }));

describe('AdminDashboard page', () => {
  it('renders admin dashboard heading and platform health data', async () => {
    renderWithProviders(<AdminDashboard />);

    expect(await screen.findByRole('heading', { name: /Admin Dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/Active campaigns/i)).toBeInTheDocument();
  });
});
