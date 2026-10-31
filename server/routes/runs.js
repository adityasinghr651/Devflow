import express from 'express';
import { randomUUID } from 'node:crypto';
import { getStorage } from '../storage/index.js';
import { getRunnerManager } from '../runner/manager.js';
import { validateRunPayload, sanitizeHeadersForStorage } from '../security/validation.js';
import { authenticateToken, verifyToken } from '../security/auth.js';
import { config } from '../config.js';

export const runsRouter = express.Router();

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled', 'timed_out']);

// GET /api/runs (Scoped to authenticated user)
runsRouter.get('/runs', authenticateToken, async (req, res, next) => {
  try {
    const storage = getStorage();
    const runs = await storage.getRuns(req.user.id);
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

// GET /api/runs/:id/events (Server-Sent Events stream for live metrics)
runsRouter.get('/runs/:id/events', async (req, res, next) => {
  try {
    // Authenticate via Authorization header or ?token= query parameter (for EventSource)
    let user = null;
    const authHeader = req.headers['authorization'];
    const queryToken = req.query.token;

    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : typeof queryToken === 'string' ? queryToken.trim() : null;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Pass Bearer token or ?token= parameter.' });
    }

    try {
      user = verifyToken(token);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired session token.' });
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
      maxConcurrency: config.maxConcurrency,
      maxDurationSec: config.maxDurationSec,
    });

    if (!validation.valid) {
      return res.status(validation.statusCode || 400).json({ error: validation.error });
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
      statusCodes: {},
    };

    const saved = await storage.createRun(run);

    await storage.createAuditEvent({
      userId: req.user.id,
      action: 'RUN_CREATE',
      resourceType: 'run',
      resourceId: saved.id,
      details: { targetId, url, method, concurrency, durationSec, profile },
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

    await runner.cancelRun(runId);

    await storage.createAuditEvent({
      userId: req.user.id,
      action: 'RUN_CANCEL',
      resourceType: 'run',
      resourceId: runId,
      details: { targetId: run.targetId },
      ipAddress: req.ip,
    });

    res.json({ requested: true, status: 'cancelling' });
  } catch (err) {
    next(err);
  }
});
