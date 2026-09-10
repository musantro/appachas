import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const rootArgument = process.argv.indexOf('--root');
if (rootArgument !== -1 && !process.argv[rootArgument + 1]) throw new Error('--root requires a directory');
const root = resolve(rootArgument === -1 ? '.' : process.argv[rootArgument + 1]);
const config = JSON.parse(readFileSync(join(root, '.vercel/output/functions/fastapi.func/.vc-config.json'), 'utf8'));
const paths = Object.keys(config.filePathMap || {});
const excluded = /^(?:\.env(?:\.|$)|\.local\/|\.git\/|supabase\/|frontend\/|backend\/tests\/|e2e\/|test-results\/)/;
if (paths.some((path) => excluded.test(path))) throw new Error('The deployment includes private local files or development-only data');
if (config.runtime !== 'python3.13') throw new Error('The deployment must use Python 3.13');
if (!paths.includes('app.py') || !paths.some((path) => path.endsWith('appachas/main.py'))) throw new Error('The deployment is missing the FastAPI application');
for (const path of paths.filter((path) => path.startsWith('_vendor/appachas/') && path.endsWith('.py'))) {
  const source = `backend/src/${path.slice('_vendor/'.length)}`;
  if (!readFileSync(join(root, source)).equals(readFileSync(join(root, config.filePathMap[path])))) throw new Error('The deployment contains an outdated backend package');
}
if (!statSync(join(root, '.vercel/output/static/index.html')).isFile()) throw new Error('The deployment is missing the static frontend');
console.log('Vercel package verified: Python 3.13, application, static frontend, and no private local files.');
