import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TreasuryPolicyForm from './TreasuryPolicyForm';

const setTreasuryPolicy = vi.fn();

vi.mock('../services/api', () => ({
  api: { setTreasuryPolicy: (...args) => setTreasuryPolicy(...args) },
}));

beforeEach(() => vi.clearAllMocks());

describe('TreasuryPolicyForm', () => {
  it('submits the configured policy', async () => {
    setTreasuryPolicy.mockResolvedValue({ id: 'policy-1' });
    render(<TreasuryPolicyForm campaignId="c-1" />);

    await userEvent.click(screen.getByLabelText(/Refund contributors automatically/i));
    await userEvent.click(screen.getByRole('button', { name: /save treasury policy/i }));

    await waitFor(() => expect(setTreasuryPolicy).toHaveBeenCalledTimes(1));
    const [campaignId, policy] = setTreasuryPolicy.mock.calls[0];
    expect(campaignId).toBe('c-1');
    expect(policy.autoRefundOnMiss).toBe(true);
    expect(policy.maxSingleWithdrawalPct).toBe(100);
  });

  it('seeds the sliders from an existing policy', () => {
    render(
      <TreasuryPolicyForm
        campaignId="c-1"
        initialPolicy={{
          min_hold_days: 30,
          max_single_withdrawal_pct: 25,
          withdrawal_cooldown_hours: 48,
          require_auditor_for_above: '5000',
          auto_refund_on_miss: true,
        }}
      />
    );
    expect(screen.getByText(/30 days/)).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByLabelText(/Refund contributors automatically/i)).toBeChecked();
  });

  it('explains that a deployed treasury cannot be edited', async () => {
    const err = new Error('deployed');
    err.code = 'TREASURY_ALREADY_DEPLOYED';
    setTreasuryPolicy.mockRejectedValue(err);
    render(<TreasuryPolicyForm campaignId="c-1" />);

    await userEvent.click(screen.getByRole('button', { name: /save treasury policy/i }));
    await waitFor(() =>
      expect(screen.getByText(/fixed on-chain and cannot be edited/i)).toBeInTheDocument()
    );
  });

  it('confirms a successful save', async () => {
    setTreasuryPolicy.mockResolvedValue({ id: 'policy-1' });
    render(<TreasuryPolicyForm campaignId="c-1" />);
    await userEvent.click(screen.getByRole('button', { name: /save treasury policy/i }));
    await waitFor(() => expect(screen.getByText(/Treasury policy saved/i)).toBeInTheDocument());
  });
});
