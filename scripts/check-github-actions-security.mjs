import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_DIR = resolve(ROOT, '.github', 'workflows');
const EXPECTED_ACTIONS = [
  'actions/checkout',
  'actions/setup-node',
  'astral-sh/setup-uv',
];
const SHA = /^[0-9a-f]{40}$/;

export function findActionReferences(source) {
  return [...source.matchAll(/^\s*-\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
}

export function validateActionReferences(files) {
  const errors = [];

  for (const [file, source] of Object.entries(files)) {
    for (const reference of findActionReferences(source)) {
      if (reference.startsWith('./')) continue;

      const separator = reference.lastIndexOf('@');
      const action = separator === -1 ? reference : reference.slice(0, separator);
      const version = separator === -1 ? '' : reference.slice(separator + 1);

      if (!EXPECTED_ACTIONS.includes(action)) {
        errors.push(`${file}: action ${action} is outside the approved allowlist`);
      }
      if (!SHA.test(version)) {
        errors.push(`${file}: ${reference} is not pinned to a full commit SHA`);
      }
    }
  }

  return errors;
}

async function loadWorkflowFiles() {
  const entries = await readdir(WORKFLOW_DIR, { withFileTypes: true });
  const workflowEntries = entries.filter(
    (entry) => entry.isFile() && /\.(yaml|yml)$/i.test(entry.name),
  );
  const files = {};

  for (const entry of workflowEntries) {
    files[basename(entry.name)] = await readFile(resolve(WORKFLOW_DIR, entry.name), 'utf8');
  }

  return files;
}

async function githubJson(path, token) {
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw new Error(`${path}: GitHub API returned ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function compareLists(actual, expected) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

async function validateRemoteControls(token) {
  const errors = [];
  const permissions = await githubJson('/actions/permissions', token);

  if (permissions.sha_pinning_required !== true) {
    errors.push('repository Actions policy must require SHA pinning');
  }
  if (permissions.allowed_actions !== 'selected') {
    errors.push('repository Actions policy must use a selected allowlist');
  } else {
    const selected = await githubJson('/actions/permissions/selected-actions', token);
    if (selected.github_owned_allowed || selected.verified_allowed) {
      errors.push('repository Actions allowlist must not enable broad GitHub-owned or verified actions');
    }
    if (!compareLists(selected.patterns_allowed ?? [], EXPECTED_ACTIONS)) {
      errors.push(`repository Actions allowlist must be exactly: ${EXPECTED_ACTIONS.join(', ')}`);
    }
  }

  const environment = await githubJson('/environments/production', token);
  const hasReviewers = (environment.protection_rules ?? []).some(
    (rule) =>
      ['Reviewers', 'required_reviewers'].includes(rule.type) &&
      (rule.reviewers?.length ?? 0) > 0,
  );
  if (!hasReviewers) {
    errors.push('production environment must require at least one reviewer');
  }
  const branchPolicy = environment.deployment_branch_policy;
  if (!branchPolicy) {
    errors.push('production environment must define a deployment branch policy');
  } else if (branchPolicy.custom_branch_policies) {
    const policies = await githubJson('/environments/production/deployment-branch-policies', token);
    if (!(policies.branch_policies ?? []).some((policy) => policy.name === 'master')) {
      errors.push('production environment deployment branch policy must include master');
    }
  } else if (!branchPolicy.protected_branches) {
    errors.push('production environment deployment branch policy must allow only protected branches');
  }

  const protection = await githubJson('/branches/master/protection', token);
  if (!protection.required_pull_request_reviews) {
    errors.push('master must require pull request reviews');
  } else if (protection.required_pull_request_reviews.required_approving_review_count < 1) {
    errors.push('master must require at least one approving review');
  }
  const checks = [
    ...(protection.required_status_checks?.contexts ?? []),
    ...(protection.required_status_checks?.checks ?? []).map((check) => check.context),
  ];
  if (checks.length === 0) {
    errors.push('master must require quality and acceptance status checks');
  }
  if (protection.enforce_admins?.enabled !== true) {
    errors.push('master protection must apply to administrators');
  }
  if (!protection.restrictions) {
    errors.push('master must restrict who can push directly');
  }
  if (protection.allow_force_pushes?.enabled === true) {
    errors.push('master must reject force pushes');
  }
  if (protection.allow_deletions?.enabled === true) {
    errors.push('master must reject deletions');
  }

  return errors;
}

export async function run({ remote = true } = {}) {
  const errors = validateActionReferences(await loadWorkflowFiles());

  if (remote) {
    const token = process.env.GITHUB_TOKEN;
    if (!process.env.GITHUB_REPOSITORY) {
      errors.push('GITHUB_REPOSITORY is required for the remote controls check');
    } else if (!token) {
      errors.push('GITHUB_TOKEN is required for the remote controls check');
    } else {
      try {
        errors.push(...(await validateRemoteControls(token)));
      } catch (error) {
        errors.push(`remote controls could not be checked: ${error.message}`);
      }
    }
  }

  return errors;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const errors = await run({ remote: !process.argv.includes('--static-only') });
  if (errors.length > 0) {
    console.error('GitHub Actions security check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log('GitHub Actions security checks passed.');
  }
}
