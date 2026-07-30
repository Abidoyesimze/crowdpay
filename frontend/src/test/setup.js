import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Provide a simple in‑memory localStorage mock for test environment
if (typeof global.localStorage === 'undefined') {
  const _storage = {};
  global.localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(_storage, key) ? _storage[key] : null;
    },
    setItem(key, value) {
      _storage[key] = String(value);
    },
    removeItem(key) {
      delete _storage[key];
    },
    clear() {
      Object.keys(_storage).forEach(k => delete _storage[k]);
    },
  };
}
// Ensure window.localStorage mirrors the same mock when JSDOM provides a window object
if (typeof window !== 'undefined' && typeof window.localStorage === 'undefined') {
  window.localStorage = global.localStorage;
}
import en from '../locales/en.json';

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof window.matchMedia === 'undefined') {
  window.matchMedia = function () {
    return {
      matches: false,
      media: '',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
  };
}

function lookup(obj, path) {
  return path.split('.').reduce((o, k) => (o && o[k] !== null && o[k] !== undefined ? o[k] : undefined), obj);
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      const val = lookup(en, key);
      if (val === null || val === undefined) return key;
      if (typeof val !== 'string') return key;
      if (opts === undefined || opts === null) return val;
      return Object.entries(opts).reduce(
        (s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v),
        val
      );
    },
    i18n: { language: 'en', resolvedLanguage: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }) => children,
}));
