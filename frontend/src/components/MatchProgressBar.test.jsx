import React from 'react';
import { render, screen } from '@testing-library/react';
import { MatchProgressBar, SponsorBadgesRow } from './MatchProgressBar';

describe('MatchProgressBar', () => {
  it('MatchProgressBar_renders_correct_percentage', () => {
    // totalPledged=1000, totalMatched=500
    // Assert progressbar at 50%

    const { container } = render(
      <MatchProgressBar
        campaignId="campaign-1"
        totalPledged={1000}
        totalMatched={500}
        matchRatio={1.0}
      />
    );

    // Check percentage display
    expect(screen.getByText(/50% of pool used/)).toBeInTheDocument();

    // Check progress bar width via role
    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).toHaveAttribute('aria-valuenow', '50');

    // Check filled portion
    const filledDiv = progressBar.querySelector('div');
    const style = window.getComputedStyle(filledDiv);
    expect(style.width).toBe('50%');
  });

  it('MatchProgressBar_shows_zero_when_no_matches', () => {
    const { container } = render(
      <MatchProgressBar
        campaignId="campaign-1"
        totalPledged={1000}
        totalMatched={0}
        matchRatio={1.0}
      />
    );

    expect(screen.getByText(/0% of pool used/)).toBeInTheDocument();

    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).toHaveAttribute('aria-valuenow', '0');
  });

  it('MatchProgressBar_displays_match_ratio', () => {
    render(
      <MatchProgressBar
        campaignId="campaign-1"
        totalPledged={1000}
        totalMatched={300}
        matchRatio={2.0}
      />
    );

    expect(screen.getByText(/Sponsor Matching Active \(2:1\)/)).toBeInTheDocument();
  });

  it('MatchProgressBar_formats_ratio_decimals', () => {
    render(
      <MatchProgressBar
        campaignId="campaign-1"
        totalPledged={1000}
        totalMatched={300}
        matchRatio={1.5}
      />
    );

    expect(screen.getByText(/Sponsor Matching Active \(1.5:1\)/)).toBeInTheDocument();
  });

  it('MatchProgressBar_returns_null_when_no_pledge', () => {
    const { container } = render(
      <MatchProgressBar
        campaignId="campaign-1"
        totalPledged={0}
        totalMatched={0}
        matchRatio={1.0}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('MatchProgressBar_shows_pool_exhausted_message', () => {
    render(
      <MatchProgressBar
        campaignId="campaign-1"
        totalPledged={500}
        totalMatched={500}
        matchRatio={1.0}
      />
    );

    expect(screen.getByText(/pool exhausted/)).toBeInTheDocument();
  });

  it('MatchProgressBar_handles_bigint_values', () => {
    render(
      <MatchProgressBar
        campaignId="campaign-1"
        totalPledged={1000n}
        totalMatched={500n}
        matchRatio={1.0}
      />
    );

    expect(screen.getByText(/50% of pool used/)).toBeInTheDocument();
  });

  it('MatchProgressBar_has_accessibility_attributes', () => {
    const { container } = render(
      <MatchProgressBar
        campaignId="campaign-1"
        totalPledged={1000}
        totalMatched={500}
        matchRatio={1.0}
      />
    );

    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    expect(progressBar).toHaveAttribute('aria-label');
  });
});

describe('SponsorBadgesRow', () => {
  it('SponsorBadgesRow_renders_sponsor_names', () => {
    const matches = [
      {
        id: 'match-1',
        sponsorName: 'Alice',
        matchRatio: 1.0,
      },
    ];

    render(<SponsorBadgesRow matches={matches} />);

    expect(screen.getByText(/Alice/)).toBeInTheDocument();
  });

  it('SponsorBadgesRow_renders_multiple_sponsors', () => {
    const matches = [
      {
        id: 'match-1',
        sponsorName: 'Alice',
        matchRatio: 1.0,
      },
      {
        id: 'match-2',
        sponsorName: 'Bob',
        matchRatio: 2.0,
      },
    ];

    render(<SponsorBadgesRow matches={matches} />);

    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
  });

  it('SponsorBadgesRow_returns_null_when_empty', () => {
    const { container } = render(<SponsorBadgesRow matches={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('SponsorBadgesRow_displays_match_ratio', () => {
    const matches = [
      {
        id: 'match-1',
        sponsorName: 'Alice',
        matchRatio: 2.5,
      },
    ];

    render(<SponsorBadgesRow matches={matches} />);

    expect(screen.getByText(/\(2.5:1\)/)).toBeInTheDocument();
  });
});
