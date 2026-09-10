// Run locally after `vercel link`, `supabase link`, and `gh auth login`.
// Credentials go directly to the matching provider, never to console or files.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

process.loadEnvFile('.env');
const project = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
const auth = JSON.parse(readFileSync(`${homedir()}/.local/share/com.vercel.cli/auth.json`, 'utf8'));
const pooler = new URL(readFileSync('supabase/.temp/pooler-url', 'utf8').trim());
if (!pooler.username.endsWith(`.${process.env.SUPABASE_PROJECT_REF}`)) throw new Error('Supabase project does not match .env');
pooler.password = process.env.SUPABASE_DB_PASSWORD;
pooler.searchParams.set('sslmode', 'require');

async function api(path, method, body) {
  const response = await fetch(`https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${project.orgId}`, {
    method,
    headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (response.status === 403 && result.error?.message === 'Cannot create tokens for this app.') {
    throw new Error('This Vercel CLI login cannot create access tokens. Create a project-scoped token in the Vercel Account Tokens dashboard and save it directly as the GitHub VERCEL_TOKEN secret.');
  }
  if (!response.ok) throw new Error(`Vercel ${method} failed (${response.status}, ${result.error?.code || 'unknown'})`);
  return result;
}
function secret(name, value) {
  const result = spawnSync('gh', ['secret', 'set', name, '--repo', 'musantro/appachas'], { input: value, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Could not set GitHub secret ${name}`);
  console.log(`Configured GitHub secret ${name}`);
}

const mode = process.argv[2];
if (mode === 'environment') {
  const existing = await api(`/v10/projects/${project.projectId}/env`, 'GET');
  const values = {
    DATABASE_URL: pooler.toString(),
    COOKIE_SECURE: 'true',
    APP_ENV: 'production',
    ALLOWED_ORIGINS: 'https://appachas.es,https://appachas.vercel.app',
  };
  if (!existing.envs?.some((entry) => entry.key === 'CRON_SECRET')) values.CRON_SECRET = randomBytes(32).toString('hex');
  for (const [key, value] of Object.entries(values)) {
    await api(`/v10/projects/${project.projectId}/env?upsert=true`, 'POST', { key, value, type: 'encrypted', target: ['production'] });
    console.log(`Configured production variable ${key}`);
  }
  await api(`/v9/projects/${project.projectId}`, 'PATCH', { framework: 'fastapi', ssoProtection: null });
  secret('PRODUCTION_DATABASE_URL', pooler.toString());
} else if (mode === 'ci') {
  const token = await api('/v3/user/tokens', 'POST', { name: 'Appachas GitHub Actions', projectId: project.projectId });
  if (typeof token.bearerToken !== 'string') throw new Error('Vercel did not return a deployment token');
  secret('VERCEL_TOKEN', token.bearerToken);
  secret('VERCEL_ORG_ID', project.orgId);
  secret('VERCEL_PROJECT_ID', project.projectId);
} else {
  throw new Error('Choose environment or ci');
}
