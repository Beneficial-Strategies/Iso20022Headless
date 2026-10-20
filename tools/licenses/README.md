# License check

`check.mjs` lists, with `pnpm licenses`, the licenses of everything the published packages (`packages/*`) depend on in
production, transitive packages included, and fails when one is outside `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`
or `0BSD`. It runs on every pull request (`packs.yml`) and before anything is published (`publish.yml`).

* A new dependency with another license (MPL-2.0, LGPL, GPL, a custom license, none) fails the check. Decide on purpose: extend
  the list in `check.mjs` only for a license that fits MIT distribution, and say why in the pull request.
* Only what the published packages need is checked. The demos, the visual tests and the build tools are not distributed with
  them; a demo that is deployed as a web page (Pages) bundles its libraries, which then need their notices.
* This checks the licenses of the packages we depend on. It does not cover ISO's content (see the README).
