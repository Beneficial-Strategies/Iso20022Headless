import { beforeEach } from 'vitest';

/**
 * Give the worker's event loop a turn, about once a second, between tests.
 *
 * The runner and its workers talk by messages with a fixed 60 second timeout (vitest's DEFAULT_TIMEOUT, not configurable). Tests that are
 * all synchronous never return to the event loop, so a reply cannot be processed until the whole file ends; a file that takes more than
 * 60 seconds then fails the run with `[vitest-worker]: Timeout calling "onTaskUpdate"` although every test passed. A slow CI machine and
 * a growing set of messages turned this from "never" into "often" (see docs/testing.md).
 */
let last = Date.now();
beforeEach(async () => {
  if (Date.now() - last < 1000) return;
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  last = Date.now();
});
