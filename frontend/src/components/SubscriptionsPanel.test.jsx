import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import SubscriptionsPanel from './SubscriptionsPanel';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getMySubscriptions: vi.fn(),
    cancelSubscription: vi.fn(),
  },
}));

const subscription = {
  id: 'sub-1',
  campaign_id: 'campaign-123',
  campaign_title: 'Solar Grid',
  amount_per_period: '10',
  asset: 'XLM',
  period_months: 1,
  total_periods: 6,
  periods_claimed: 2,
  next_payment_date: '2026-09-17T00:00:00.000Z',
  status: 'active',
};

function renderPanel() {
  return render(
    <MemoryRouter>
      <SubscriptionsPanel />
    </MemoryRouter>
  );
}

describe('SubscriptionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists active subscriptions with their next payment date', async () => {
    api.getMySubscriptions.mockResolvedValue({ subscriptions: [subscription] });
    renderPanel();

    expect(await screen.findByText('Solar Grid')).toBeInTheDocument();
    expect(screen.getByText(/10 XLM · Monthly · 2\/6 paid/)).toBeInTheDocument();
    expect(screen.getByText(/Next payment:/)).toBeInTheDocument();
  });

  it('reports the periods that could not be cancelled', async () => {
    api.getMySubscriptions.mockResolvedValue({ subscriptions: [subscription] });
    api.cancelSubscription.mockResolvedValue({
      cancelled: 3,
      nonCancellable: 1,
      non_cancellable_balances: [{ id: 'b1', reason: 'already_claimed' }],
      estimatedRefundDate: '2026-12-16T00:00:00.000Z',
    });
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(api.cancelSubscription).toHaveBeenCalledWith('campaign-123', 'sub-1')
    );
    expect(await screen.findByText(/3 future payments cancelled/)).toBeInTheDocument();
    expect(screen.getByText(/1 could not be cancelled/)).toBeInTheDocument();
  });

  it('prompts the contributor when they have no subscriptions', async () => {
    api.getMySubscriptions.mockResolvedValue({ subscriptions: [] });
    renderPanel();

    expect(await screen.findByText(/no recurring pledges yet/)).toBeInTheDocument();
  });
});
