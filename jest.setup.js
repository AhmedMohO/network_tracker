// Avoid loading Expo's native fetch lazily during Jest's global cleanup.
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  writable: true,
  value: jest.fn(() => Promise.reject(new Error('Unexpected network request in a unit test'))),
});
