import { defineConfig } from 'vitest/config';

// The generated message modules are large and every test file loads many of them. In worker threads, on a small CI machine, the
// run finished all its tests and then failed with `[vitest-worker]: Timeout calling "onTaskUpdate"` (an unhandled error). Separate
// processes talk to the runner over their own channel and do not hit it.
export default defineConfig({ test: { pool: 'forks' } });
