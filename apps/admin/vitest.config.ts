import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': resolve(process.cwd(), 'src'), 'server-only': resolve(process.cwd(), 'src/test-stubs/server-only.ts') } },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
