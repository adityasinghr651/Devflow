import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('composite Action invokes CLI, uploads results, and upserts one PR comment', () => {
  const action = fs.readFileSync('action.yml', 'utf8');
  assert.match(action, /GITHUB_ACTION_PATH\/bin\/devflow\.js/);
  assert.match(action, /--api/);
  assert.match(action, /--token/);
  assert.match(action, /actions\/upload-artifact@v4/);
  assert.match(action, /Decision band/);
  assert.match(action, /most recent comparable runs/);
  assert.match(action, /report\.regression\?\.verdict/);
  assert.match(action, /if: always\(\)/);
  assert.match(action, /<!-- devflow-performance-result -->/);
  assert.match(action, /issues\.updateComment/);
  assert.match(action, /issues\.createComment/);
  assert.match(action, /if \(existing\) await[\s\S]*updateComment[\s\S]*else await[\s\S]*createComment/);
});
