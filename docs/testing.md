# Testing notes

## A test file that never yields can fail the whole run

Vitest's runner and its workers talk by messages with a **fixed 60 second timeout** (`DEFAULT_TIMEOUT` in vitest, not configurable). A test file
whose tests are all synchronous never returns to the worker's event loop, so no reply can be processed until the file ends. If the file
takes more than 60 seconds, the run fails with

```
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
```

as an *unhandled error*, although every test passed. It looks like a flaky runner but is deterministic: a file over the threshold fails.

How it showed up: `packages/validate/test/leaves.test.ts` (1,452 synchronous tests, one per message and check) grew with every batch of messages,
from 11 s on CI (when there were 43 messages) to 75–80 s with 363. Pull-request runs that crossed about 75 s failed, those under 65 s passed. A
65-second synchronous test file reproduces it in isolation; the same file whose tests yield first does not.

What prevents it now:

* `packages/validate/test/setup-yield.ts` (a `setupFiles` entry in `vitest.config.ts`) gives the event loop a turn, about once a second, between
  tests. Any heavy synchronous test file in that package is safe from this.
* The leaf tests are split by business area (`leaves-<area>.test.ts`, with the shared code in `leaves-lib.ts`), so they run side by side: the
  slowest file went from 27 s to 7.5 s on a development machine and the package from 31 s to 17 s. `leaves-areas.test.ts` fails if an area has no file,
  so a new area cannot silently go unchecked: copy one of the small files.

If another package grows a synchronous test file past about 30 seconds, give it the same hook (a `setupFiles` entry with the same content).
