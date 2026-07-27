import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { NetworkStatusProvider } from '../context/NetworkStatusContext';

export function renderWithProviders(ui, { route = '/', ...options } = {}) {
  const Wrapper = ({ children }) => (
    <ThemeProvider>
      <ToastProvider>
        <NetworkStatusProvider>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </NetworkStatusProvider>
      </ToastProvider>
    </ThemeProvider>
  );

  return render(ui, { wrapper: Wrapper, ...options });
}
