import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import HowItWorks from '../../pages/HowItWorks';
import { renderWithProviders } from '../renderWithProviders';

describe('HowItWorks page', () => {
  it('renders the how it works heading and steps', () => {
    renderWithProviders(<HowItWorks />);

    expect(screen.getByRole('heading', { name: /How CrowdPay works/i })).toBeInTheDocument();
    expect(screen.getByText(/Discover a cause/i)).toBeInTheDocument();
  });
});
