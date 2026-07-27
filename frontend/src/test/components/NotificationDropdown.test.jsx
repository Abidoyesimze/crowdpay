import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../renderWithProviders';
import NotificationDropdown from '../../components/NotificationDropdown';

vi.mock('../../services/api', () => ({
  api: {
    markNotificationRead: vi.fn().mockResolvedValue({}),
  },
}));

import { api } from '../../services/api';

describe('NotificationDropdown', () => {
  it('marks an unread notification as read and closes the dropdown', async () => {
    const onMarkRead = vi.fn();
    const onMarkAllRead = vi.fn();
    const onClose = vi.fn();
    const notifications = [
      {
        id: 'notif-1',
        title: 'New contribution',
        body: 'A supporter just backed your campaign.',
        created_at: '2026-07-25T12:00:00.000Z',
        read_at: null,
        link: '/campaigns/1',
      },
    ];

    renderWithProviders(
      <NotificationDropdown
        notifications={notifications}
        onMarkRead={onMarkRead}
        onMarkAllRead={onMarkAllRead}
        onClose={onClose}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /New contribution/i }));
    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledWith('notif-1'));
    expect(onMarkRead).toHaveBeenCalledWith('notif-1');
    expect(onClose).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Mark all as read/i }));
    expect(onMarkAllRead).toHaveBeenCalled();
  });
});
