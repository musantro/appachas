import assert from 'node:assert/strict';
import test from 'node:test';
import { projectLink } from '../pull-production.mjs';

const project = { id: 'project', accountId: 'owner', name: 'appachas', framework: 'fastapi', nodeVersion: '24.x' };

test('project-only settings are sufficient to link the verified release', () => {
  const link = projectLink(project, 'project', 'owner');
  assert.equal(link.projectName, 'appachas');
  assert.equal(link.settings.framework, 'fastapi');
  assert.equal(link.settings.nodeVersion, '24.x');
});

test('settings never include runtime secrets or unrelated API response data', () => {
  const link = projectLink({ ...project, env: [{ key: 'DATABASE_URL', value: 'private-value' }], secret: 'private-value' }, 'project', 'owner');
  assert.equal(JSON.stringify(link).includes('private-value'), false);
  assert.equal('env' in link.settings, false);
});

test('a different project cannot replace the configured deployment target', () => {
  assert.throws(() => projectLink(project, 'different-project', 'owner'));
});

test('a different owner cannot replace the configured deployment target', () => {
  assert.throws(() => projectLink(project, 'project', 'different-owner'));
});
