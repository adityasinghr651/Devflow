import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildPullRequestComment, upsertPullRequestComment } = require('../../tools/github-action-comment.cjs');

const context = { repo: { owner: 'devflow', repo: 'app' }, issue: { number: 17 } };
const report = {
  totalRequests: 100, successCount: 99, failedCount: 1, assertionFailureCount: 0,
  regression: {
    verdict: 'regression', baselineCount: 5, historySize: 5, minimumBaselineRuns: 3,
    metrics: { p95: { observed: 60, band: { lower: 40, upper: 55 }, verdict: 'regression' } },
  },
};

test('PR comment includes baseline window, metric decision bands, and direct artifact URL', () => {
  const body = buildPullRequestComment(report, 'https://github.com/devflow/app/actions/runs/123/artifacts/456');
  assert.match(body, /\*\*Verdict:\*\* regression/);
  assert.match(body, /5\/5 most recent comparable runs; 3 minimum required/);
  assert.match(body, /\| p95 \| 60 \| 40–55 \| regression \|/);
  assert.match(body, /\[Download the full JSON artifact\]\(https:\/\/github\.com\/devflow\/app\/actions\/runs\/123\/artifacts\/456\)/);
});

test('PR comment helper updates the existing marked comment instead of adding a duplicate', async () => {
  const calls = [];
  const github = { rest: { issues: {
    listComments: async args => { calls.push(['list', args]); return { data: [{ id: 8, body: '<!-- devflow-performance-result --> old' }, { id: 9, body: 'other comment' }] }; },
    updateComment: async args => calls.push(['update', args]),
    createComment: async args => calls.push(['create', args]),
  } } };
  const result = await upsertPullRequestComment(github, context, 'new report');
  assert.deepEqual(result, { action: 'updated', commentId: 8 });
  assert.equal(calls.filter(call => call[0] === 'create').length, 0);
  assert.deepEqual(calls[1], ['update', { owner: 'devflow', repo: 'app', comment_id: 8, body: 'new report' }]);
});

test('PR comment helper creates the marked comment when one does not exist', async () => {
  const calls = [];
  const github = { rest: { issues: {
    listComments: async () => ({ data: [{ id: 2, body: 'unrelated' }] }),
    updateComment: async args => calls.push(['update', args]),
    createComment: async args => { calls.push(['create', args]); return { data: { id: 10 } }; },
  } } };
  const result = await upsertPullRequestComment(github, context, '<!-- devflow-performance-result --> report');
  assert.deepEqual(result, { action: 'created', commentId: 10 });
  assert.deepEqual(calls[0], ['create', { owner: 'devflow', repo: 'app', issue_number: 17, body: '<!-- devflow-performance-result --> report' }]);
});
