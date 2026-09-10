import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function projectLink(project, projectId, orgId) {
  if (project.id !== projectId || project.accountId !== orgId) {
    throw new Error('Vercel returned a different project or owner; refusing to link it.');
  }
  const fields = [
    'createdAt', 'framework', 'devCommand', 'installCommand', 'buildCommand',
    'outputDirectory', 'rootDirectory', 'directoryListing', 'nodeVersion',
    'sourceFilesOutsideRootDirectory',
  ];
  return {
    projectId,
    orgId,
    projectName: project.name,
    settings: Object.fromEntries(fields.map((key) => [key, project[key] ?? null])),
  };
}

async function main() {
  const { VERCEL_TOKEN: token, VERCEL_PROJECT_ID: projectId, VERCEL_ORG_ID: orgId } = process.env;
  if (!token || !projectId || !orgId) throw new Error('The three Vercel CI secrets must be configured.');
  // `vercel pull` also requests the team profile, which project-scoped tokens
  // correctly cannot read. The build only needs these project-level settings;
  // runtime secrets stay in Vercel and are never downloaded into release inputs.
  const response = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Cannot read the Appachas project settings (HTTP ${response.status}).`);
  const link = projectLink(await response.json(), projectId, orgId);
  mkdirSync('.vercel', { recursive: true });
  writeFileSync('.vercel/project.json', `${JSON.stringify(link, null, 2)}\n`, { mode: 0o600 });
  console.log('Verified Appachas project settings downloaded without account-level access or runtime secrets.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
