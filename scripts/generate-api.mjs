import { spawnSync } from 'node:child_process';

for (const [command, args] of [
  ['uv', ['run', '--project', 'backend', 'python', 'backend/scripts/export_openapi.py']],
  ['npm', ['--prefix', 'frontend', 'run', 'generate:api']],
]) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
