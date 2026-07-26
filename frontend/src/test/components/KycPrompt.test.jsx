import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../renderWithProviders';
import KycPrompt from '../../components/KycPrompt';

vi.mock('../../services/api', () => ({
  api: {
    startKyc: vi.fn(),
  },
}));

import { api } from '../../services/api';

describe('KycPrompt', () => {
  it('starts KYC and calls onUserUpdate when the API returns a user', async () => {
    const onUserUpdate = vi.fn();
    api.startKyc.mockResolvedValue({ user: { id: 'user123', name: 'Creator Name' } });

    renderWithProviders(<KycPrompt onUserUpdate={onUserUpdate} />);

    await userEvent.click(screen.getByRole('button', { name: /Verify your identity/i }));
    await waitFor(() => expect(api.startKyc).toHaveBeenCalled());

    expect(onUserUpdate).toHaveBeenCalledWith({ id: 'user123', name: 'Creator Name' });
    expect(screen.getByText(/CrowdPay requires verified creator identity/i)).toBeInTheDocument();
  });
});
