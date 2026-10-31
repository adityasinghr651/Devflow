import http from 'node:http';

export const TARGET_CONFIG = {
  defaultPort: 5050,
  host: '127.0.0.1', // Localhost binding only
  maxDelayMs: 5000,   // Max bounded delay for /slow
  maxEchoBytes: 65536, // 64 KB max payload for /echo
  minLargeKb: 1,      // 1 KB min for /large
  maxLargeKb: 512,    // 512 KB max for /large
};

/**
 * Creates and returns the HTTP server instance for the controlled test target.
 * Can be used standalone or embedded in automated tests.
 */
export function createTestTargetServer(options = {}) {
  const host = TARGET_CONFIG.host;
  const startTime = Date.now();
  let reqCount = 0;

  const server = http.createServer(async (req, res) => {
    // Standard CORS headers for testing
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const reqUrl = new URL(req.url, `http://${host}`);
    const pathname = reqUrl.pathname;

    // Helper: JSON response
    const sendJson = (statusCode, data) => {
      res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };

    // 1. GET /health - Predictable 200 response
    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(200, {
        status: 'ok',
        service: 'ServerTest-Controlled-Target',
        timestamp: new Date().toISOString(),
        uptimeSec: Math.floor((Date.now() - startTime) / 1000),
      });
    }

    // 2. GET /slow - Configurable bounded delay
    if (req.method === 'GET' && pathname === '/slow') {
      const msParam = reqUrl.searchParams.get('ms');
      const delayMs = msParam === null ? 100 : Number(msParam);

      if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > TARGET_CONFIG.maxDelayMs) {
        return sendJson(400, {
          error: `Query parameter 'ms' must be an integer between 0 and ${TARGET_CONFIG.maxDelayMs} milliseconds.`,
          received: msParam,
        });
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
      return sendJson(200, {
        delayedMs: delayMs,
        message: `Responded after ${delayMs}ms controlled delay.`,
        timestamp: new Date().toISOString(),
      });
    }

    // 3. GET /status/:code (including GET /status/500) - Predictable status response
    if (req.method === 'GET' && pathname.startsWith('/status/')) {
      const codeStr = pathname.slice('/status/'.length);
      const code = Number(codeStr);

      if (!Number.isInteger(code) || code < 200 || code > 599) {
        return sendJson(400, {
          error: 'Invalid HTTP status code. Must be an integer between 200 and 599.',
          received: codeStr,
        });
      }

      return sendJson(code, {
        statusCode: code,
        message: code >= 500 ? 'Simulated server error response.' : `Simulated status ${code} response.`,
        timestamp: new Date().toISOString(),
      });
    }

    // 4. GET /mixed - Alternating 200 OK and 500 Internal Server Error for testing mixed status metrics
    if (req.method === 'GET' && pathname === '/mixed') {
      reqCount++;
      const code = reqCount % 2 === 0 ? 200 : 500;
      return sendJson(code, {
        statusCode: code,
        message: code === 200 ? 'Mixed response: success' : 'Mixed response: failure',
        requestIndex: reqCount,
        timestamp: new Date().toISOString(),
      });
    }

    // 4. POST /echo - Return validated request body with strict size limit
    if (req.method === 'POST' && pathname === '/echo') {
      let receivedBytes = 0;
      const chunks = [];
      let exceeded = false;

      req.on('data', chunk => {
        receivedBytes += chunk.length;
        if (receivedBytes > TARGET_CONFIG.maxEchoBytes) {
          exceeded = true;
          req.destroy(); // Stop receiving data immediately
          return sendJson(413, {
            error: `Payload exceeds maximum permitted size of ${TARGET_CONFIG.maxEchoBytes} bytes (64KB).`,
            receivedBytes,
          });
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        if (exceeded) return;

        const rawBody = Buffer.concat(chunks).toString('utf8');
        let parsedBody = null;

        const contentType = req.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          try {
            parsedBody = rawBody.trim() ? JSON.parse(rawBody) : {};
          } catch {
            return sendJson(400, {
              error: 'Malformed JSON payload.',
            });
          }
        } else {
          parsedBody = rawBody;
        }

        return sendJson(200, {
          echoed: parsedBody,
          contentType: contentType || 'text/plain',
          bytes: receivedBytes,
          timestamp: new Date().toISOString(),
        });
      });

      req.on('error', err => {
        if (!exceeded) {
          sendJson(500, { error: 'Failed to read request body', details: err.message });
        }
      });

      return;
    }

    // 5. GET /large - Return a configurable but bounded response payload
    if (req.method === 'GET' && pathname === '/large') {
      const kbParam = reqUrl.searchParams.get('kb');
      const sizeKb = kbParam === null ? 64 : Number(kbParam);

      if (!Number.isInteger(sizeKb) || sizeKb < TARGET_CONFIG.minLargeKb || sizeKb > TARGET_CONFIG.maxLargeKb) {
        return sendJson(400, {
          error: `Query parameter 'kb' must be an integer between ${TARGET_CONFIG.minLargeKb} and ${TARGET_CONFIG.maxLargeKb} KB.`,
          received: kbParam,
        });
      }

      const targetBytes = sizeKb * 1024;
      const pattern = 'ServerTestPayloadBlock0123456789ABCDEF-'; // 40 bytes
      const repeatCount = Math.floor(targetBytes / pattern.length);
      const remainder = targetBytes % pattern.length;
      const payloadData = pattern.repeat(repeatCount) + pattern.slice(0, remainder);

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(JSON.stringify({
          sizeKb,
          bytes: targetBytes,
          data: payloadData,
        })),
      });

      return res.end(JSON.stringify({
        sizeKb,
        bytes: targetBytes,
        data: payloadData,
      }));
    }

    // 404 for unmapped endpoints
    return sendJson(404, {
      error: 'Endpoint not found on controlled test target.',
      path: pathname,
      availableEndpoints: ['GET /health', 'GET /slow?ms=100', 'GET /status/500', 'GET /mixed', 'POST /echo', 'GET /large?kb=64'],
    });
  });

  return server;
}

// CLI direct entry point: node tools/test-target.js
const isDirectEntry = process.argv[1] && (
  process.argv[1].endsWith('test-target.js') ||
  process.argv[1].endsWith('test-target')
);

if (isDirectEntry) {
  const port = Number(process.env.TARGET_PORT || process.argv[2] || TARGET_CONFIG.defaultPort);
  const server = createTestTargetServer();

  server.listen(port, TARGET_CONFIG.host, () => {
    console.log(`[ServerTest-Target] Controlled test target running on http://${TARGET_CONFIG.host}:${port}`);
    console.log(`[ServerTest-Target] Health check: http://${TARGET_CONFIG.host}:${port}/health`);
    console.log(`[ServerTest-Target] Press Ctrl+C to stop.`);
  });

  const shutdown = () => {
    console.log('\n[ServerTest-Target] Shutting down controlled test target...');
    server.close(() => {
      console.log('[ServerTest-Target] Server stopped.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

