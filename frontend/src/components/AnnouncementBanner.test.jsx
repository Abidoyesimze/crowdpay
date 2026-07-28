import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnnouncementBanner from './AnnouncementBanner';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getActiveAnnouncements: vi.fn(),
  },
}));

describe('AnnouncementBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('renders the highest severity active announcement with details link', async () => {
    api.getActiveAnnouncements.mockResolvedValue([
      {
        id: 'info-1',
        message: 'General maintenance',
        severity: 'info',
        active_from: '2026-07-25T10:00:00.000Z',
      },
      {
        id: 'critical-1',
        message: 'Payments are temporarily delayed',
        severity: 'critical',
        details_url: 'https://status.example.com/incidents/1',
        active_from: '2026-07-25T09:00:00.000Z',
      },
    ]);

    render(<AnnouncementBanner />);

    expect(await screen.findByText('Payments are temporarily delayed')).toBeInTheDocument();
    expect(screen.queryByText('General maintenance')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /details/i })).toHaveAttribute(
      'href',
      'https://status.example.com/incidents/1'
    );
    expect(screen.getByRole('status')).toHaveClass('announcement-banner--critical');
  });

  it('persists dismissal until the message changes', async () => {
    api.getActiveAnnouncements.mockResolvedValue([
      {
        id: 'ann-1',
        message: 'Scheduled maintenance',
        severity: 'warning',
      },
    ]);

    const user = userEvent.setup();
    const { unmount } = render(<AnnouncementBanner />);

    expect(await screen.findByText('Scheduled maintenance')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /dismiss announcement/i }));
    expect(screen.queryByText('Scheduled maintenance')).not.toBeInTheDocument();

    unmount();
    api.getActiveAnnouncements.mockResolvedValue([
      {
        id: 'ann-1',
        message: 'Scheduled maintenance',
        severity: 'warning',
      },
    ]);
    render(<AnnouncementBanner />);
    await waitFor(() => expect(api.getActiveAnnouncements).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Scheduled maintenance')).not.toBeInTheDocument();

    unmount();
    api.getActiveAnnouncements.mockResolvedValue([
      {
        id: 'ann-1',
        message: 'Scheduled maintenance updated',
        severity: 'warning',
      },
    ]);
    render(<AnnouncementBanner />);
    expect(await screen.findByText('Scheduled maintenance updated')).toBeInTheDocument();
  });

  it('polls for active announcements every 60 seconds', async () => {
    vi.useFakeTimers();
    api.getActiveAnnouncements.mockResolvedValue([]);

    render(<AnnouncementBanner />);
    await act(async () => {});
    expect(api.getActiveAnnouncements).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(api.getActiveAnnouncements).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
