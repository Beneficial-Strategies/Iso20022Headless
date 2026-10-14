# Publishing to npm

Five packages, one version number, published together under the `@beneficial-strategies` scope (the `beneficial-strategies` npm organization):
`iso20022-types`, `iso20022-validate`, `iso20022-serialize`, `iso20022-react`, `iso20022-react-ui`.

## How a package is built

In the repository a package exports its TypeScript source (`"./src/index.ts"`), so the apps and the tests need no build. A published package exports compiled files:

* `pnpm --filter "./packages/*" run build` compiles each package to `dist/` (`tsc -p tsconfig.build.json`, then `tools/publish/postbuild.mjs`, which points the
  declaration files at `.js` and copies the stylesheet). Packages are built in dependency order.
* `publishConfig.exports` in each `package.json` maps the same names to `dist/`; pnpm swaps it in when it packs, and replaces `workspace:*` with the version.
  It is generated: `node tools/publish/sync-manifests.mjs` writes it (and the metadata), and CI runs it with `--check`, so a new export cannot be forgotten.
* `pnpm pack` in a package runs `tools/publish/prepack.mjs` (needs a built `dist/`, copies the LICENSE in) and produces the tarball.

To look at what would be published, without publishing: build, then `pnpm pack --pack-destination <folder>` in a package, and install the tarballs in an empty project.

## One-time setup

1. An npm account with two-factor authentication (a passkey), and the organization `beneficial-strategies` with two-factor authentication required.
2. **The first version of each package is published by hand**, because a Trusted Publisher can only be attached to a package that exists:
   `pnpm install --frozen-lockfile`, build, then in each package folder, in dependency order (`types`, `validate`, `serialize`, `react`, `react-ui`):
   `pnpm publish --access public --tag alpha --no-git-checks` (`--tag` is required for a prerelease version). It asks for the passkey. No token is created.
3. On npmjs.com, for each package: Settings, Trusted Publisher, GitHub Actions: organization `Beneficial-Strategies`, repository `Iso20022Headless`,
   workflow file `publish.yml`, environment `npm`. Then set the package's publishing access to "require two-factor authentication and disallow tokens".
4. In the GitHub repository: Settings, Environments, New environment `npm`, with yourself as a required reviewer.

## A release

1. Set the same version in all five `package.json` files (`0.1.0-alpha.1`, `0.1.0`, ...), commit, merge to `main`.
2. Push a tag `v<version>` (`git tag v0.1.0-alpha.1 && git push origin v0.1.0-alpha.1`).
3. The `Publish to npm` workflow checks the tag against the versions, typechecks, tests, builds, and waits for the reviewer of the `npm` environment. Approve it.
   It publishes with no stored token and with provenance. A prerelease (`-alpha.1`) goes under the dist-tag `alpha`; a plain version under `latest`.

The workflow does not run on a branch or a pull request.
