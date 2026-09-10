import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const release = JSON.parse(readFileSync('.vercel/release.json', 'utf8'));
const directory = resolve(release.directory);
if (!basename(directory).startsWith('appachas-release-')) throw new Error('Invalid release directory');
const expected = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
const actual = JSON.parse(readFileSync(`${directory}/.vercel/project.json`, 'utf8'));
if (expected.projectId !== actual.projectId || expected.orgId !== actual.orgId) throw new Error('The release belongs to a different Vercel project');
for (const [command, args] of [
  ['node', ['scripts/check-deployment.mjs', '--root', directory]],
  ['npx', ['--yes', 'vercel@59.11.7', 'deploy', '--prebuilt', '--prod', '--yes', '--cwd', directory]],
]) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' } });
  if (result.status !== 0) process.exit(result.status || 1);
}
