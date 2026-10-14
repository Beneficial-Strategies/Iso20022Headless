#!/usr/bin/env node
// Runs before `pnpm pack` / `pnpm publish` in a package: the package must be built, and it carries the repository's LICENSE.
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
if (!existsSync(join(dist, 'index.js'))) throw new Error(`${dist} has no index.js: run \`pnpm build\` first`);
copyFileSync(join(process.cwd(), '..', '..', 'LICENSE'), join(process.cwd(), 'LICENSE'));
