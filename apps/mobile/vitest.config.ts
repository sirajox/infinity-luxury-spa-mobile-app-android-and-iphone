import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit tests cover platform-independent logic only; native modules are mocked per test file.
export default defineConfig({
  resolve: { alias: { '@': resolve(process.cwd(), 'src') } },
  define: { __DEV__: false },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
