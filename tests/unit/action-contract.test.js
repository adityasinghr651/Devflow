import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('composite Action invokes CLI, uploads results, and upserts one PR comment', () => {
  const action = fs.readFileSync('action.yml', 'utf8');
  const comment = fs.readFileSync('tools/github-action-comment.cjs', 'utf8');
  assert.match(action, /GITHUB_ACTION_PATH\/bin\/devflow\.js/);
  assert.match(action, /--api/);
  assert.match(action, /--token/);
  assert.match(action, /actions\/upload-artifact@v4/);
  assert.match(action, /if: always\(\)/);
  assert.match(action, /github-action-comment\.cjs/);
  assert.match(action, /steps\.result-artifact\.outputs\.artifact-url/);
  assert.match(comment, /Decision band/);
  assert.match(comment, /most recent comparable runs/);
  assert.match(comment, /Download the full JSON artifact/);
  assert.match(comment, /devflow-performance-result/);
});
