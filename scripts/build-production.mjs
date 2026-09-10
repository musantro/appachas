import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Vercel CLI 59.11.7 passes native FastAPI exclusions under config.functions,
// while @vercel/python 13.0.1 only reads config.excludeFiles when bundling.
// Build from an explicit runtime allowlist so private local files never become
// inputs to the native builder. Keep the original project and frontend intact.
export function prepareStage(root = repository) {
  const stage = mkdtempSync(join(tmpdir(), 'appachas-release-'));
  const files = [
    'app.py',
    'pyproject.toml',
    'uv.lock',
    '.python-version',
    'backend/pyproject.toml',
    '.vercel/project.json',
  ];
  for (const relative of files) {
    const destination = join(stage, relative);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(root, relative), destination);
  }
  cpSync(join(root, 'backend/src'), join(stage, 'backend/src'), {
    recursive: true,
    filter: (source) => basename(source) !== '__pycache__' && !source.endsWith('.pyc'),
  });
  cpSync(join(root, 'public'), join(stage, 'public'), { recursive: true });
  const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  // The complete frontend was built before staging; this keeps the native
  // Python dependency installation while avoiding a second frontend toolchain.
  config.buildCommand = 'true';
  writeFileSync(join(stage, 'vercel.json'), `${JSON.stringify(config, null, 2)}\n`);
  return stage;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    // Vercel reads VERCEL_TOKEN from the environment. Never put credentials in
    // command arguments: the CLI records its arguments in build metadata.
    env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}`);
}

function main() {
  if (!existsSync(join(repository, '.vercel/project.json'))) {
    throw new Error('Link the Vercel project before preparing its production build.');
  }
  run('npm', ['run', 'build'], repository);
  const stage = prepareStage();
  run('npx', ['--yes', 'vercel@59.11.7', 'build', '--prod', '--yes', '--cwd', stage], stage);
  run(process.execPath, [join(repository, 'scripts/check-deployment.mjs'), '--root', stage], stage);
  writeFileSync(
    join(repository, '.vercel/release.json'),
    `${JSON.stringify({ directory: stage, created_at: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log('Production build verified. Its directory is recorded in .vercel/release.json.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
