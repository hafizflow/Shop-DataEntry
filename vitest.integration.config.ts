import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    env: loadEnv(mode, process.cwd(), ''),
    testTimeout: 20000,
  },
}));
