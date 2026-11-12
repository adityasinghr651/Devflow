const marker = '<!-- devflow-performance-result -->';

function buildPullRequestComment(report, artifactUrl) {
  const regression = report?.regression || {};
  const metrics = regression.metrics || {};
  const rows = ['rps', 'p95', 'p99', 'errorRate'].map(key => {
    const metric = metrics[key];
    const observed = Number.isFinite(metric?.observed) ? metric.observed : 'n/a';
    const band = metric?.band ? `${metric.band.lower}–${metric.band.upper}` : 'n/a';
    return `| ${key} | ${observed} | ${band} | ${metric?.verdict || 'insufficient_data'} |`;
  }).join('\n');
  const baseline = `${regression.baselineCount ?? 0}/${regression.historySize ?? 0} most recent comparable runs; ${regression.minimumBaselineRuns ?? 0} minimum required`;
  const requests = report
    ? `Requests: ${report.totalRequests ?? 'n/a'} (${report.successCount ?? 'n/a'} passed, ${report.failedCount ?? 'n/a'} failed; ${report.assertionFailureCount ?? 0} assertion failures)`
    : 'Run failed before producing a result.';
  const artifact = artifactUrl ? `[Download the full JSON artifact](${artifactUrl})` : 'Full JSON artifact is unavailable for this run.';
  return `${marker}\n## DevFlow performance result\n\n**Verdict:** ${regression.verdict || 'unavailable'}\n\n**Baseline window:** ${baseline}\n\n${requests}\n\n| Metric | Observed | Decision band | Verdict |\n|---|---:|---:|---|\n${rows}\n\n${artifact}`;
}

async function upsertPullRequestComment(github, context, body) {
  const { owner, repo } = context.repo;
  const issue_number = context.issue.number;
  const comments = await github.rest.issues.listComments({ owner, repo, issue_number });
  const existing = comments.data.find(comment => comment.body.includes(marker));
  if (existing) {
    await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    return { action: 'updated', commentId: existing.id };
  }
  const created = await github.rest.issues.createComment({ owner, repo, issue_number, body });
  return { action: 'created', commentId: created.data?.id };
}

module.exports = { buildPullRequestComment, upsertPullRequestComment };
