import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    maxWorkers: 2,
    minWorkers: 1,
    include: ['tests/**/*.test.ts'],
    reporters: ['basic'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/*.compilation-test.ts', 'src/main.ts', 'src/monopush-cli.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85, // Lower threshold for branch coverage
        statements: 90,
      },
    },
  },
})
