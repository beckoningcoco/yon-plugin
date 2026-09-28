import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    // Specs that need a DOM carry a `// @vitest-environment jsdom` pragma; the
    // default stays node for the pure-logic specs.
  },
})
