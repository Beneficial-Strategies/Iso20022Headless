import { defineConfig } from 'vitest/config';

// pool 'forks': separate processes instead of threads (the generated message modules are large). setupFiles: see test/setup-yield.ts.
export default defineConfig({ test: { pool: 'forks', setupFiles: ['./test/setup-yield.ts'] } });
