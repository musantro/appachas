import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findActionReferences,
  validateActionReferences,
} from '../check-github-actions-security.mjs';

test('finds action references without interpreting run commands', () => {
  assert.deepEqual(
    findActionReferences(`
      - uses: actions/checkout@abc
      - run: echo "uses: fake/action@tag"
      - uses: ./local-action
    `),
    ['actions/checkout@abc', './local-action'],
  );
});

test('accepts only approved actions pinned to full SHAs', () => {
  const validSha = 'a'.repeat(40);
  assert.deepEqual(
    validateActionReferences({
      'valid.yml': [
        `- uses: actions/checkout@${validSha}`,
        `- uses: actions/setup-node@${validSha}`,
        `- uses: astral-sh/setup-uv@${validSha}`,
      ].join('\n'),
    }),
    [],
  );
});

test('rejects mutable or unapproved action references', () => {
  const errors = validateActionReferences({
    'invalid.yml': [
      '- uses: actions/checkout@v4',
      '- uses: third-party/action@' + 'b'.repeat(40),
    ].join('\n'),
  });

  assert.equal(errors.length, 2);
  assert.match(errors[0], /full commit SHA/);
  assert.match(errors[1], /outside the approved allowlist/);
});
