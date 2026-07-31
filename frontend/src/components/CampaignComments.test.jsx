import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import CampaignComments from './CampaignComments';
import { api } from '../services/api';

// Mock hooks rather than importing unexported context objects
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../context/ToastContext', () => ({
  useToast: vi.fn(),
}));
vi.mock('../services/api', () => ({
  api: {
    getCampaignComments: vi.fn(),
    postCampaignComment: vi.fn(),
    upvoteCampaignComment: vi.fn(),
    flagCampaignComment: vi.fn(),
    deleteCampaignComment: vi.fn(),
    getFlaggedCampaignComments: vi.fn(),
  },
}));

import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const mockCampaign = {
  id: 'campaign-123',
  title: 'Clean Water Project',
  creator_id: 'creator-999',
};

const mockComments = [
  {
    id: 'comment-1',
    campaign_id: 'campaign-123',
    author_id: 'user-101',
    author_name: 'Backer Bob',
    parent_id: null,
    body: 'When is the expected delivery date?',
    created_at: new Date().toISOString(),
    is_creator_reply: false,
    upvotes_count: 5,
    user_upvoted: false,
    hidden: false,
  },
  {
    id: 'comment-2',
    campaign_id: 'campaign-123',
    author_id: 'creator-999',
    author_name: 'Jane Creator',
    parent_id: 'comment-1',
    body: 'Delivery is expected in Q4 of this year.',
    created_at: new Date().toISOString(),
    is_creator_reply: true,
    upvotes_count: 2,
    user_upvoted: true,
    hidden: false,
  },
];

function renderComponent(overrides = {}) {
  const { user = null, toast = vi.fn() } = overrides;
  useAuth.mockReturnValue({ user });
  useToast.mockReturnValue(toast);
  return render(<CampaignComments campaignId="campaign-123" campaign={mockCampaign} />);
}

describe('CampaignComments Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getCampaignComments.mockResolvedValue(mockComments);
  });

  it('renders campaign comments and Creator badge for creator replies', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/Campaign Q&A & Comments/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Backer Bob')).toBeInTheDocument();
    expect(screen.getByText('When is the expected delivery date?')).toBeInTheDocument();

    expect(screen.getByText('Jane Creator')).toBeInTheDocument();
    expect(screen.getByText('Delivery is expected in Q4 of this year.')).toBeInTheDocument();

    const creatorBadge = screen.getByText('Creator');
    expect(creatorBadge).toBeInTheDocument();
  });

  it('handles comment upvoting for logged-in users', async () => {
    api.upvoteCampaignComment.mockResolvedValue({ upvoted: true, upvotes_count: 6 });

    renderComponent({ user: { id: 'user-101', name: 'Backer Bob' } });

    await waitFor(() => {
      expect(screen.getByText('When is the expected delivery date?')).toBeInTheDocument();
    });

    const upvoteButtons = screen.getAllByRole('button', { name: /upvote comment/i });
    fireEvent.click(upvoteButtons[0]);

    await waitFor(() => {
      expect(api.upvoteCampaignComment).toHaveBeenCalledWith('campaign-123', 'comment-1');
    });
  });

  it('allows authenticated user to submit a top-level question', async () => {
    api.postCampaignComment.mockResolvedValue({
      id: 'comment-3',
      body: 'Will there be open-source hardware files?',
    });

    renderComponent({ user: { id: 'user-101', name: 'Backer Bob' } });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask a question or share a comment/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Ask a question or share a comment/i);
    fireEvent.change(input, { target: { value: 'Will there be open-source hardware files?' } });

    const submitBtn = screen.getByRole('button', { name: /Ask question \/ Post comment/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.postCampaignComment).toHaveBeenCalledWith('campaign-123', {
        body: 'Will there be open-source hardware files?',
      });
    });
  });

  it('allows flagging an offensive comment', async () => {
    const mockToast = vi.fn();
    api.flagCampaignComment.mockResolvedValue({});

    renderComponent({ user: { id: 'user-102', name: 'Other User' }, toast: mockToast });

    await waitFor(() => {
      expect(screen.getByText('When is the expected delivery date?')).toBeInTheDocument();
    });

    const reportBtn = screen.getAllByText('Report / Flag')[0];
    fireEvent.click(reportBtn);

    await waitFor(() => {
      expect(api.flagCampaignComment).toHaveBeenCalledWith('campaign-123', 'comment-1', {});
      expect(mockToast).toHaveBeenCalledWith('Comment reported for moderation review', 'success');
    });
  });
});
