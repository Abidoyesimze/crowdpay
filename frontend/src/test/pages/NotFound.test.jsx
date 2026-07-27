import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFound from '../../pages/NotFound';
import { render } from '@testing-library/react';

describe('NotFound page', () => {
  it('renders the 404 heading and a link back to home', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Page not found/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Home/i })[0]).toBeInTheDocument();
  });
});
