import express from 'express';
import { randomUUID } from 'node:crypto';
import { randomBytes, createHash } from 'node:crypto';
import { getStorage } from '../storage/index.js';
import { getRunnerManager } from '../runner/manager.js';
import { validateRunPayload, sanitizeHeadersForStorage } from '../security/validation.js';
import { authenticateToken, verifyToken } from '../security/auth.js';
import { config } from '../config.js';
import { evaluateRunRegression } from '../runner/regression.js';
import { recordAuditEvent } from '../audit.js';

export const runsRouter = express.Router();

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled', 'timed_out']);
const streamTickets = new Map();

runsRouter.post('/runs/:id/events-ticket', authenticateToken, async (req, res, next) => {
  try {
    const storage = getStorage();
    const run = await storage.getRunById(req.params.id, req.user.id);
    if (!run) return res.status(404).json({ error: 'Run not found.' });
    const now = Date.now();
    for (const [ticket, value] of streamTickets) if (value.expiresAt <= now) streamTickets.delete(ticket);
    const ticket = randomBytes(32).toString('base64url');
    streamTickets.set(ticket, { userId: req.user.id, runId: run.id, expiresAt: now + 30_000 });
    res.json({ ticket, expiresInSeconds: 30 });
  } catch (err) {
    next(err);
  }
});

// GET /api/runs (Scoped to authenticated user)
runsRouter.get('/runs', authenticateToken, async (req, res, next) => {
  try {
    const storage = getStorage();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const [runs, total] = await Promise.all([storage.getRuns(req.user.id, { limit, offset }), storage.countRuns(req.user.id)]);
    res.setHeader('X-Total-Count', String(total));
    res.setHeader('X-Next-Offset', offset + runs.length < total ? String(offset + runs.length) : '');
    res.json(runs);
  } catch (err) {
    next(err);
  }
});

// GET /api/runs/:id (Scoped to authenticated user)
runsRouter.get('/runs/:id', authenticateToken, async (req, res, next) => {
  try {
    const storage = getStorage();
    const run = await storage.getRunById(req.params.id, req.user.id);
    if (!run) {
      return res.status(404).json({ error: 'Run not found.' });
    }
    res.json(run);
  } catch (err) {
    next(err);
  }
});

runsRouter.get('/runs/:id/regression', authenticateToken, async (req, res, next) => {
  try {
    const storage = getStorage();
    const run = await storage.getRunById(req.params.id, req.user.id);
    if (!run) return res.status(404).json({ error: 'Run not found.' });
    const history = await storage.getRuns(req.user.id);
    res.json(evaluateRunRegression(run, history));
  } catch (err) {
    next(err);
  }
});

// GET /api/runs/:id/events (Server-Sent Events stream for live metrics)
runsRouter.get('/runs/:id/events', async (req, res, next) => {
  try {
    // EventSource cannot set Authorization headers, so it uses a single-use 30-second ticket.
    let user = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try { user = verifyToken(authHeader.slice(7).trim()); }
      catch { return res.status(401).json({ error: 'Invalid or expired session token.' }); }
    } else {
      const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : '';
      const ticketInfo = streamTickets.get(ticket);
      streamTickets.delete(ticket);
      if (!ticketInfo || ticketInfo.expiresAt <= Date.now() || ticketInfo.runId !== req.params.id) {
        return res.status(401).json({ error: 'A valid single-use stream ticket is required.' });
      }
      user = { id: ticketInfo.userId };
    }

    const storage = getStorage();
    const runner = getRunnerManager(storage);
    const runId = req.params.id;

    const run = await storage.getRunById(runId, user.id);
    if (!run) {
      return res.status(404).json({ error: 'Run not found.' });
    }

    // Set Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Helper to send formatted SSE message
    function sendEvent(eventType, payload) {
      if (res.writableEnded || res.destroyed) return;
      res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
    }

    // Send initial snapshot
    sendEvent('snapshot', run);

    // If already in terminal state, signal end and close
    if (TERMINAL_STATES.has(run.status)) {
      sendEvent('end', { status: run.status });
      return res.end();
    }

    // Listeners for live worker updates
    const onProgress = (data) => {
      sendEvent('progress', data);
    };

    const onStatus = (statusData) => {
      sendEvent('status', statusData);
      if (TERMINAL_STATES.has(statusData.status)) {
        sendEvent('end', statusData);
        cleanup();
        res.end();
      }
    };

    const onComplete = (data) => {
      sendEvent('complete', data);
      sendEvent('end', { status: 'completed', ...data });
      cleanup();
      res.end();
    };

    const onError = (errMsg) => {
      sendEvent('error', { error: errMsg });
      sendEvent('end', { status: 'failed', error: errMsg });
      cleanup();
      res.end();
    };

    runner.events.on(`progress:${runId}`, onProgress);
    runner.events.on(`status:${runId}`, onStatus);
    runner.events.on(`complete:${runId}`, onComplete);
    runner.events.on(`error:${runId}`, onError);

    // Keep-alive heartbeat every 15s to keep connection open through proxies
    const heartbeatTimer = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) {
        res.write(': keep-alive\n\n');
      }
    }, 15000);

    function cleanup() {
      clearInterval(heartbeatTimer);
      runner.events.removeListener(`progress:${runId}`, onProgress);
      runner.events.removeListener(`status:${runId}`, onStatus);
      runner.events.removeListener(`complete:${runId}`, onComplete);
      runner.events.removeListener(`error:${runId}`, onError);
    }

    req.on('close', () => {
      cleanup();
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/runs (Scoped to authenticated user)
runsRouter.post('/runs', authenticateToken, async (req, res, next) => {
  try {
    const storage = getStorage();
    const runner = getRunnerManager(storage);

    const targetId = req.body?.targetId;
    const target = targetId ? await storage.getTargetById(targetId, req.user.id) : null;

    const validation = validateRunPayload(req.body, target, {
      maxConcurrency: req.user.tier === 'demo' ? 2 : config.maxConcurrency,
      maxDurationSec: req.user.tier === 'demo' ? Math.min(10, config.maxDurationSec) : ['paid','admin'].includes(req.user.tier) ? config.maxDurationSec : Math.min(30, config.maxDurationSec),
    });

    if (!validation.valid) {
      return res.status(validation.statusCode || 400).json({ error: validation.error });
    }

    const userRuns = await storage.getRuns(req.user.id);
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const activeRuns = userRuns.filter(run => ['queued', 'validating', 'running', 'cancelling'].includes(run.status));
    const dailyRuns = userRuns.filter(run => Date.parse(run.createdAt || run.startedAt) >= oneDayAgo);
    const runCost = validation.data.concurrency * validation.data.durationSec;
    const dailyVuSeconds = dailyRuns.reduce((total, run) => total + (Number(run.concurrency) || 0) * (Number(run.durationSec) || 0), 0);
    let quotaReason = null;
    const isPaidOrAdmin = ['paid', 'admin'].includes(req.user.tier);
    if (req.user.tier !== 'admin' && activeRuns.length >= config.maxActiveRunsPerUser) quotaReason = 'active_run_limit';
    else if (!isPaidOrAdmin && dailyRuns.length >= config.maxRunsPerDay) quotaReason = 'daily_run_limit';
    else if (!isPaidOrAdmin && dailyVuSeconds + runCost > config.maxVuSecondsPerDay) quotaReason = 'daily_vu_seconds_limit';

    if (quotaReason) {
      await storage.createAuditEvent({
        userId: req.user.id,
        action: 'RUN_QUOTA_DENIED',
        resourceType: 'run',
        details: { quota: quotaReason },
        ipAddress: req.ip,
      });
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error: 'Run quota exceeded.', quota: quotaReason, retryAfterSeconds: 60 });
    }

    const {
      targetName,
      url,
      method,
      concurrency,
      durationSec,
      profile,
      stages,
      headers,
      body,
      timeoutMs,
      workerCount,
      assertions,
    } = validation.data;

    // Sanitize headers to prevent persisting sensitive tokens / credentials in DB/reports
    const sanitizedHeaders = sanitizeHeadersForStorage(headers);

    const run = {
      id: randomUUID(),
      userId: req.user.id,
      targetId,
      targetName,
      url,
      method,
      concurrency,
      durationSec,
      profile,
      stages,
      headers: sanitizedHeaders,
      body: body || null,
      timeoutMs,
      workerCount: workerCount || 1,
      assertions,
      assertionFailureCount: 0,
      status: 'queued',
      startedAt: new Date().toISOString(),
      totalRequests: 0,
      successCount: 0,
      failedCount: 0,
      rps: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      errorRate: 0,
      redirectBlockedCount: 0,
      measurementWindowSec: null,
      statusCodes: {},
    };

    const quotaLimit = req.user.tier === 'admin' ? Infinity : req.user.tier === 'paid' ? config.paidRunQuota : req.user.tier === 'demo' ? 10 : 15;
    const demoIpHash = req.user.tier === 'demo' ? createHash('sha256').update(req.ip || req.socket.remoteAddress || 'unknown').digest('hex') : null;
    const saved = await storage.createRun(run, { quotaLimit, demoIpHash });
    if (!saved) {
      res.setHeader('Upgrade', 'signup');
      return res.status(429).json({ error: req.user.tier === 'demo' ? 'Demo limit reached (10 runs per session and IP). Sign up for a free account to continue.' : req.user.tier === 'paid' ? 'Pro plan run quota reached.' : 'Free plan includes 15 test runs total. Upgrade to Pro to continue.', quota: 'lifetime_run_limit' });
    }

    await recordAuditEvent(storage, {
      userId: req.user.id,
      action: 'RUN_CREATE',
      resourceType: 'run',
      resourceId: saved.id,
      details: { targetId, url, method, concurrency, durationSec, profile, workerCount },
      ipAddress: req.ip,
    });

    // Pass the actual unredacted headers to the worker process via IPC
    const runWithExecHeaders = {
      ...saved,
      headers, // unredacted for outgoing HTTP requests
    };

    // Enqueue asynchronously to worker runner
    runner.enqueueRun(runWithExecHeaders).catch(err => {
      console.error(`[Runner] Error dispatching run ${saved.id}:`, err);
    });

    res.status(202).json(saved);
  } catch (err) {
    next(err);
  }
});

runsRouter.delete('/runs/:id', authenticateToken, async (req, res, next) => {
  try {
    const storage = getStorage();
    const run = await storage.getRunById(req.params.id, req.user.tier === 'admin' ? null : req.user.id);
    if (!run) return res.status(404).json({ error: 'Run not found.' });
    if (!['paid', 'admin'].includes(req.user.tier)) return res.status(403).json({ error: req.user.tier === 'free' ? 'Deleting runs requires a paid plan.' : 'Demo history cannot be deleted.' });
    if (['queued','running','validating','cancelling'].includes(run.status)) return res.status(409).json({ error: 'Active runs cannot be deleted.' });
    const deleted = await storage.deleteRun(run.id, req.user.tier === 'admin' ? null : req.user.id);
    if (!deleted) return res.status(404).json({ error: 'Run not found.' });
    await recordAuditEvent(storage, { userId: req.user.id, action: 'RUN_DELETE', resourceType: 'run', resourceId: run.id, ipAddress: req.ip });
    res.json({ deleted: true });
  } catch (error) { next(error); }
});

// POST /api/runs/:id/cancel (Scoped to authenticated user)
runsRouter.post('/runs/:id/cancel', authenticateToken, async (req, res, next) => {
  try {
    const storage = getStorage();
    const runner = getRunnerManager(storage);
    const runId = req.params.id;

    const run = await storage.getRunById(runId, req.user.id);
    if (!run) {
      return res.status(404).json({ error: 'Run not found.' });
    }

    if (TERMINAL_STATES.has(run.status)) {
      return res.status(409).json({ error: 'Run is already finished.' });
    }

    const cancellation = await runner.cancelRun(runId);
    if (!cancellation.success) {
      return res.status(409).json({ error: 'Run is no longer active.', status: cancellation.status || run.status });
    }

    await recordAuditEvent(storage, {
      userId: req.user.id,
      action: 'RUN_CANCEL',
      resourceType: 'run',
      resourceId: runId,
      details: { targetId: run.targetId },
      ipAddress: req.ip,
    });

    res.json({ requested: true, status: cancellation.status });
  } catch (err) {
    next(err);
  }
});
