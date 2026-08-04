// Test setup file for Jest
import '@testing-library/jest-dom';
import { randomUUID as nodeRandomUUID } from 'crypto';

// Mock window.fetch globally
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    blob: () => Promise.resolve(new Blob()),
    headers: new Headers(),
  })
);

// Mock file-saver
jest.mock('file-saver', () => ({ saveAs: jest.fn() }));

// Mock window.URL helpers without replacing the URL constructor
if (!window.URL) {
  window.URL = URL;
}

if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = jest.fn(() => 'mock-url');
}

if (!window.URL.revokeObjectURL) {
  window.URL.revokeObjectURL = jest.fn();
}

// Setup for global user role
global.setUserRole = jest.fn();

// Mock any browser APIs that might be used
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {
    return null;
  }
  unobserve() {
    return null;
  }
  disconnect() {
    return null;
  }
};

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {},
    configurable: true,
  });
}

if (!globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: nodeRandomUUID,
    configurable: true,
  });
}
