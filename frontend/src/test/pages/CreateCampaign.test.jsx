import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import CreateCampaign from '../../pages/CreateCampaign';
import { renderWithProviders } from '../renderWithProviders';

vi.mock('react-simplemde-editor', () => ({
  default: ({ id, value, onChange }) => (
    <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user1', role: 'creator', kyc_status: 'verified' },
    ready: true,
    updateUser: vi.fn(),
  }),
}));

const apiMocks = vi.hoisted(() => ({
  getMe: vi.fn().mockResolvedValue({ id: 'user1', role: 'creator' }),
  checkDuplicateCampaign: vi.fn().mockResolvedValue({ isDuplicate: false }),
  createCampaign: vi.fn().mockResolvedValue({ id: 'new-campaign' }),
  uploadCampaignCoverImage: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../services/api', () => ({ api: apiMocks }));

describe('CreateCampaign page', () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '');
  });

  it('submits the campaign creation form with correct values', async () => {
    renderWithProviders(<CreateCampaign />);

    const title = await screen.findByLabelText(/Campaign title/i);
    fireEvent.change(title, { target: { value: 'New campaign' } });

    const target = screen.getByLabelText(/Fundraising goal/i);
    fireEvent.change(target, { target: { value: '500' } });

    fireEvent.click(screen.getByRole('button', { name: /Continue to details/i }));

    const description = await screen.findByLabelText(/Description/i);
    fireEvent.change(description, { target: { value: 'This is a test campaign.' } });

    fireEvent.click(screen.getByRole('button', { name: /Continue to milestones/i }));

    fireEvent.click(await screen.findByRole('button', { name: /Launch campaign/i }));

    await waitFor(() => {
      expect(apiMocks.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New campaign',
          description: 'This is a test campaign.',
          target_amount: '500',
        })
      );
    });
  });
});
