# Visual and layout checks

Drives the two demos in a real browser and does two things:

* **`pnpm visual shots`** saves a screenshot of every state into `tools/visual/out/` (git-ignored), so a person
  can look: themes, text sizes, languages, both skins, a narrow phone window, a short window, and each popup open.
* **`pnpm visual check`** does the same and also fails (exit code 1) when it measures a layout problem.
  Each check exists because that bug has shipped before:

  | Check | Catches |
  |---|---|
  | `page-overflow-x`, `form-overflow-x` | content wider than the window or the form panel |
  | `popup-outside-viewport`, `popup-covered`, `popup-hidden`, `popup-clipped` | dropdowns, help notes, the type list and the Display dialog being cut off by the scrolling form |
  | `control-invisible`, `control-collapsed` | text boxes with no border or background (Tailwind's reset once made the plain skin's controls invisible) |
  | `single-line` | header buttons wrapping onto two lines on a narrow screen |
  | console errors | React warnings such as invalid HTML nesting (`<details>` inside `<p>`) |

  Some states also assert behavior (a dropdown lists every code with its description, a required field shows its own
  "Required" error and is marked `aria-invalid`, the plain skin renders no classes).
* **`pnpm visual selftest`** breaks the page on purpose in each way a check is meant to catch and confirms that
  check fires (and that the untouched page is clean). Run it after changing a check.
* `pnpm visual list` lists the states; `--only <name>` runs one; `--out <dir>` changes where screenshots go.

## Requirements

A Chrome or Chromium on the machine. Nothing is downloaded: the tool finds an installed browser (macOS, Linux and
Windows locations, or `chromium` / `google-chrome` on the PATH). Set `CHROME_PATH` to use a specific one. It starts
the demo dev servers itself on free ports, so there is nothing else to run.

## Using it in CI

Optional. Any runner with Chrome (GitHub Actions' Ubuntu images have it) can run `pnpm visual check`. It does **not**
compare screenshots to saved images, because rendering differs between machines and that makes noisy failures. The
checks are measurements, which are stable across machines. Add a state in `src/scenarios.ts`, a check in `src/checks.ts`.
