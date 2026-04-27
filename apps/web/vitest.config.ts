import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx']
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
      '@evokernel/schemas': fileURLToPath(new URL('../../schemas/index.ts', import.meta.url))
    }
  }
});
