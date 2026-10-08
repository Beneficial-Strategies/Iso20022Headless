# Deploying the demos on Cloudflare

The demos also deploy as a **Cloudflare Worker** (the site as static assets, plus one small function). GitHub Pages keeps
working as before; the two do not depend on each other. The reason for adding Cloudflare is the **XSD Validate** button:
ISO's server sends no cross-origin permission, so on GitHub Pages the schema has to be loaded from a file. On Cloudflare the
Worker fetches ISO's schema for the page, so the button enables itself (see `docs/xsd-validation.md`).

## What is in the repository

| File | What |
|---|---|
| `wrangler.jsonc` | The Worker: `site/` as assets; only `/iso20022-xsd/*` runs the Worker first. |
| `tools/cloudflare/src/worker.ts` | The entry: schema requests to the pass-through, everything else to the assets. |
| `tools/cloudflare/src/xsd-proxy.ts` | The pass-through, written to be tested without a network (`tools/cloudflare/test`). |
| `tools/pages/assemble-cloudflare.mjs`, `_headers.cloudflare` | The Cloudflare site: the TanStack Form demo at the root, with cache (built files for a year) and security headers. |
| `tools/pages/_headers` | The same headers for the GitHub Pages layout (`/form/`, `/zod/`); GitHub Pages ignores the file. |

## The pass-through, and what it will not do

`/iso20022-xsd/<area>/schemas/<identifier>.xsd` is answered by fetching
`https://www.iso20022.org/sites/default/files/documents/messages/<area>/schemas/<identifier>.xsd`. It is **not** an open proxy:

* only that exact path shape (four letters, then an identifier of the same area), no other host, no query strings, no traversal;
* only `GET` and `HEAD`;
* only an answer that is an XML Schema (a bot-protection page that answers `200` is refused), at most 8 MB;
* kept in Cloudflare's cache for a day (browsers for an hour), so ISO's server sees about one request per file per day;
* it says who is asking (`User-Agent: Iso20022Explorer (+repository address)`).

Nothing is stored in the repository or on Cloudflare beyond that cache. **Please check ISO's terms of use for the schemas**
before relying on this; the design is a pass-through of their public files, not a copy.

## Setting it up (Workers Builds: Cloudflare watches the repository)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** → this repository.
2. Worker name `iso20022-explorer` (it must match `name` in `wrangler.jsonc`; if it does not, the build still deploys, under the dashboard's name, but warns and Cloudflare offers a pull request to change the file). A Worker cannot be renamed in the dashboard: to change the name, create a new Worker and delete the old one. Production branch `main`.
3. **Build command**: `pnpm install --frozen-lockfile && pnpm pages:cloudflare`
   **Deploy command**: `npx wrangler deploy` (the default).
   `pnpm pages:cloudflare` builds **only the TanStack Form demo** (not the Zod-only demo, not the landing page) and puts it at the
   root of the site, with the pages set to ask their own site for schemas (`VITE_XSD_PROXY=on`). The GitHub Pages build
   (`pnpm pages:build`: both demos and the landing page) does not set it and is not affected.
4. **Variables**: `NODE_VERSION` = `24`.
5. After the first deploy: **Settings → Domains & Routes → Add → Custom domain**. The live name is
   `iso20022-explorer.beneficialstrategies.com` (the site must be at the root of a host: the Worker answers `/iso20022-xsd/*`
   at the root). Use a name **one level** below the zone: Cloudflare's free universal certificate covers `beneficialstrategies.com`
   and `*.beneficialstrategies.com` only, so a name such as `iso20022.explorer.beneficialstrategies.com` (two levels) gets a DNS
   record but fails the TLS handshake (`alert handshake failure`) until a certificate is ordered for it (Advanced Certificate
   Manager, paid). Tried and confirmed on 2026-10-07.
6. Try it: `curl -I https://<your host>/iso20022-xsd/pain/schemas/pain.001.001.13.xsd` should say `200` with
   `content-type: application/xml`, and the demo's **XSD Validate** button should be enabled without any file.

### Previews for pull request branches (Worker Previews)

Cloudflare builds every branch. On the Worker's **Settings → Builds** there are two tabs, **Production** and **Previews Base**,
and each has its own settings: set the **build command** and the variable `NODE_VERSION` = `24` on both (switching to Worker
Previews drops them). **Builds for Preview branches** is on, and the **Preview command** is `npx wrangler preview`. The site
needs no runtime variables, secrets or bindings, so there is nothing else to copy. `wrangler.jsonc` must carry a `previews` block
(an empty one is enough) or the command stops with "missing a `previews` block".

**The site is built by the repository, not only by the dashboard.** The dashboard's build command did not run for preview builds
(the log goes from installing dependencies straight to the preview command, and the preview command that ran was not the one saved
on the tab), so `wrangler.jsonc` has `build.command` = `node tools/pages/ensure-site.mjs`. Wrangler runs it before it reads
`assets.directory`; it builds `./site` only when it is missing, so production, whose dashboard build already made the site, does
not build twice. Checked locally: `wrangler preview` runs the custom build before the assets check.

History, so the next person need not repeat it (2026-10-08): the first preview model ran `npx wrangler versions upload` against the
Production settings and failed on every branch with "The name in your wrangler.jsonc file must match the name of your Worker",
even though the names were identical. Cloudflare's own prompt to **Switch to Worker Previews** is the fix; it cannot be undone,
which only affects previews. Preview addresses are public to anyone with the link.

If ISO's server refuses Cloudflare's addresses, the pass-through answers `502 ISO's server answered 403.` and the button
falls back to the right-click file loading, exactly as on GitHub Pages. Nothing breaks.

## Trying it on your machine

```
pnpm pages:cloudflare
npx wrangler dev          # http://localhost:8787, Cloudflare's local runtime
```

## Rights the deployment needs

Nothing beyond the Workers Builds connection (Cloudflare's GitHub app on this repository and the account's Workers
permissions). There is no API token in the repository or in GitHub; no secrets are used.

## Status

First deployed 2026-10-07 on `workers.dev` and then at `https://iso20022-explorer.beneficialstrategies.com/` (as a Worker named `iso20022headless`, before it was recreated under the name in `wrangler.jsonc`). Checked there: the schema pass-through returns ISO's
`pain.001.001.13`, `pacs.008.001.14` and `caam.001.001.05` files byte for byte (so ISO accepts Cloudflare's addresses), the second
request is an edge-cache hit, bad paths answer 404, and in a real browser **XSD Validate** enables itself and validates.
