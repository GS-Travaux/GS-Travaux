import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'supabase/tests/**/*.test.ts', 'api/**/*.test.ts'],
    testTimeout: 60000,
  },
});
