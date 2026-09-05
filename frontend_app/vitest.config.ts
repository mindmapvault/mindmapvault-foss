import { defineConfig } from 'vitest/config';

/**
 * Unit tests run in Node, not a browser. What they cover — layout arithmetic
 * and tree operations — is pure, and the one browser dependency
 * (`measureText`, which asks a canvas) is stubbed per test so widths are the
 * same on every machine. Real font metrics would make the numbers a property
 * of the runner rather than of the code. The few tests that genuinely need a
 * DOM ask for one with a `@vitest-environment jsdom` pragma.
 *
 * Same shape as `mindmapvault-server` and `mindmapvault-saas`, deliberately:
 * the three frontends are near-copies and their tooling should not diverge
 * as well.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/**/*.test.ts?(x)',
      'src/**/__tests__/**/*.test.ts?(x)',
      // The layout and geometry live in @mindmapvault/mindmap-core; their
      // tests moved with them, and this project is what runs them.
      '../packages/*/src/**/__tests__/**/*.test.ts?(x)',
    ],
    alias: {
      '@mindmapvault/mindmap-core': new URL('../packages/mindmap-core/src/index.ts', import.meta.url).pathname,
    },
  },
});
