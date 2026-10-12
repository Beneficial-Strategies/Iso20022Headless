/**
 * The command line of a language's text repository. It uses no library code (see textrepoLib.ts); the English comes from the source
 * artifact in `<repo>/source` (or `--source <dir>`).
 *
 *   node src/textrepo.ts sync   --repo <dir> --from <artifact folder>      take a version of the library's source artifact
 *   node src/textrepo.ts status --repo <dir>                              what is overridden, reviewed, stale, orphaned, misplaced
 *   node src/textrepo.ts check  --repo <dir>                              lint (exit code 1 on errors)
 *   node src/textrepo.ts add    --repo <dir> --kind labels --key PostCode    copy the English into the file, ready to edit
 *   node src/textrepo.ts build  --repo <dir> --out <dir> [--messages id,id]  the files a text host serves
 */
import { join, resolve } from 'node:path';
import { add, build, check, readArtifact, readJson, status, sync } from './textrepoLib.ts';

const arg = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const cmd = process.argv[2];
const repo = resolve(arg('--repo') ?? '.');
const sourceDir = resolve(arg('--source') ?? join(repo, 'source'));
if (cmd === 'sync') {
  const from = arg('--from');
  if (!from) throw new Error('usage: textrepo.ts sync --repo <dir> --from <artifact folder>');
  sync(repo, resolve(from));
} else if (cmd === 'status') status(repo, readArtifact(sourceDir));
else if (cmd === 'check') process.exitCode = check(repo, readArtifact(sourceDir));
else if (cmd === 'add') add(repo, readArtifact(sourceDir), arg('--kind') ?? '', arg('--key') ?? '');
else if (cmd === 'build') {
  const messages = (arg('--messages') ?? 'pain.001.001.13,pain.002.001.15,head.001.001.04').split(',');
  build(repo, readArtifact(sourceDir), resolve(arg('--out') ?? 'out'), messages, readJson<{ lang: string }>(join(repo, 'text.config.json'), { lang: 'en-US' }).lang);
} else console.error('usage: textrepo.ts <sync|status|check|add|build> --repo <dir> ...');
