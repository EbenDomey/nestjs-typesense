import { defineConfig } from 'vitest/config'

// Integration tests hit a real Typesense server (see CONTRIBUTING / TASK-004).
// Kept out of `npm test` so the unit suite stays hermetic.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
})
