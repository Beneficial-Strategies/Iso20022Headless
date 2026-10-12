import { defineConfig } from 'vitest/config';

// Extracting every unit (72,890 texts) and reading the four catalogs (72 MB) take about five seconds on a small CI machine, which is the
// default limit of a test: two of these tests failed a run on it. They are heavy by nature; a hung test is still caught, a minute later.
export default defineConfig({ test: { testTimeout: 60_000, hookTimeout: 60_000 } });
