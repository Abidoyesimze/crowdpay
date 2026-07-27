import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders';
import MilestoneTracker from '../../components/MilestoneTracker';

describe('MilestoneTracker', () => {
  it('renders milestone status, description, and on-chain state', () => {
    renderWithProviders(
      <MilestoneTracker
        milestones={[
          {
            id: 'milestone-1',
            title: 'Build community garden',
            description: 'Prepare the site and purchase materials.',
            release_percentage: '50',
            status: 'released',
            on_chain: true,
          },
        ]}
        assetType="USDC"
        contractMilestones={[{ index: 0, on_chain_status: 'released' }]}
      />
    );

    expect(screen.getByText(/Milestone releases/i)).toBeInTheDocument();
    expect(screen.getByText(/Build community garden/i)).toBeInTheDocument();
    expect(screen.getByText(/Released on-chain/i)).toBeInTheDocument();
    expect(screen.getByText(/Releases 50% of campaign funds in USDC/i)).toBeInTheDocument();
  });
});
