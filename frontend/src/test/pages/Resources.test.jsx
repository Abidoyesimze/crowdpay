import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import Resources from '../../pages/Resources';
import { renderWithProviders } from '../renderWithProviders';

describe('Resources page', () => {
  it('renders the resources page heading and links', () => {
    renderWithProviders(<Resources />);

    expect(screen.getByRole('heading', { name: /Resources/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /How CrowdPay works/i })).toBeInTheDocument();
  });
});
