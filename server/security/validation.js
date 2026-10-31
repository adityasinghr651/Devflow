import { validateTargetUrl } from './ssrf.js';
import { isLocalhostTarget } from './ownership.js';

const ALLOWED_ENVIRONMENTS = ['Development', 'Staging', 'Production', 'Local'];
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH'];
const SENSITIVE_HEADER_KEYS = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key', 'token', 'secret', 'password']);

export function sanitizeHeadersForStorage(headers = {}) {
  if (!headers || typeof headers !== 'object') return {};
  const sanitized = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (SENSITIVE_HEADER_KEYS.has(lower) || lower.includes('token') || lower.includes('key') || lower.includes('secret')) {
      sanitized[k] = '[REDACTED]';
    } else {
      sanitized[k] = String(v);
    }
  }
  return sanitized;
}

export async function validateTargetPayload(payload, options = {}) {
  const { name, url, environment = 'Development' } = payload || {};

  if (typeof name !== 'string' || name.trim().length < 1 || name.length > 80) {
    return { valid: false, error: 'Target name must be between 1 and 80 characters.' };
  }

  if (typeof url !== 'string' || url.trim().length === 0 || url.length > 2048) {
    return { valid: false, error: 'A valid target URL is required.' };
  }

  const ssrfResult = await validateTargetUrl(url.trim(), options);
  if (!ssrfResult.valid) {
    return { valid: false, error: ssrfResult.error };
  }

  const safeEnv = ALLOWED_ENVIRONMENTS.includes(environment) ? environment : 'Development';

  return {
    valid: true,
    data: {
      name: name.trim(),
      url: ssrfResult.url,
      environment: safeEnv,
    },
  };
}

export function validateRunPayload(payload, target, limits = {}) {
  const {
    targetId,
    path = '/',
    method = 'GET',
    concurrency = 5,
    durationSec = 10,
    profile = 'fixed',
    stages,
    headers = {},
    body,
    timeoutMs = 5000,
    authorized,
  } = payload || {};

  const maxConcurrency = limits.maxConcurrency || 20;
  const maxDurationSec = limits.maxDurationSec || 30;
  const maxTotalStageDuration = limits.maxTotalStageDuration || 60;

  if (authorized !== true) {
    return {
      valid: false,
      statusCode: 403,
      error: 'Explicit target authorization confirmation is required.',
    };
  }

  if (!target) {
    return {
      valid: false,
      statusCode: 404,
      error: 'Target not found.',
    };
  }

  // Non-local targets must have completed domain ownership verification
  if (!isLocalhostTarget(target.url) && !target.verified) {
    return {
      valid: false,
      statusCode: 403,
      error: 'Target domain ownership verification required for non-local targets. Please verify your domain in the Targets view.',
    };
  }

  let finalConcurrency = Number(concurrency);
  let finalDuration = Number(durationSec);
  let validStages = [];

  if (profile === 'stages') {
    if (!Array.isArray(stages) || stages.length === 0 || stages.length > 10) {
      return {
        valid: false,
        statusCode: 400,
        error: 'Workload stages must be an array of 1 to 10 stage items.',
      };
    }

    let totalDuration = 0;
    let peakConcurrency = 0;

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const targetVUs = Number(stage?.target);
      const stageDur = Number(stage?.durationSec);

      if (!Number.isInteger(targetVUs) || targetVUs < 0 || targetVUs > maxConcurrency) {
        return {
          valid: false,
          statusCode: 400,
          error: `Stage ${i + 1} target virtual users must be an integer between 0 and ${maxConcurrency}.`,
        };
      }

      if (!Number.isInteger(stageDur) || stageDur < 1 || stageDur > maxDurationSec) {
        return {
          valid: false,
          statusCode: 400,
          error: `Stage ${i + 1} duration must be an integer between 1 and ${maxDurationSec} seconds.`,
        };
      }

      totalDuration += stageDur;
      peakConcurrency = Math.max(peakConcurrency, targetVUs);
      validStages.push({ target: targetVUs, durationSec: stageDur });
    }

    if (totalDuration > maxTotalStageDuration) {
      return {
        valid: false,
        statusCode: 400,
        error: `Total stages duration cannot exceed ${maxTotalStageDuration} seconds.`,
      };
    }

    finalDuration = totalDuration;
    finalConcurrency = Math.max(peakConcurrency, 1);
  } else {
    if (!Number.isInteger(finalConcurrency) || finalConcurrency < 1 || finalConcurrency > maxConcurrency) {
      return {
        valid: false,
        statusCode: 400,
        error: `Concurrency must be an integer from 1 to ${maxConcurrency}.`,
      };
    }

    if (!Number.isInteger(finalDuration) || finalDuration < 1 || finalDuration > maxDurationSec) {
      return {
        valid: false,
        statusCode: 400,
        error: `Duration must be an integer from 1 to ${maxDurationSec} seconds.`,
      };
    }
  }

  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.length > 1024
  ) {
    return {
      valid: false,
      statusCode: 400,
      error: 'Endpoint path must start with a single slash and be at most 1024 characters.',
    };
  }

  const normMethod = typeof method === 'string' ? method.toUpperCase() : '';
  if (!ALLOWED_METHODS.includes(normMethod)) {
    return {
      valid: false,
      statusCode: 400,
      error: 'Unsupported HTTP method.',
    };
  }

  // Validate custom headers
  const safeHeaders = {};
  if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
    const keys = Object.keys(headers);
    if (keys.length > 20) {
      return {
        valid: false,
        statusCode: 400,
        error: 'A maximum of 20 custom headers is permitted.',
      };
    }
    for (const [k, v] of Object.entries(headers)) {
      if (!/^[a-zA-Z0-9_-]+$/.test(k) || k.length > 64) {
        return {
          valid: false,
          statusCode: 400,
          error: `Invalid header name: ${k}`,
        };
      }
      const valStr = String(v);
      if (/[\r\n]/.test(valStr) || valStr.length > 1024) {
        return {
          valid: false,
          statusCode: 400,
          error: `Invalid header value for ${k}. CRLF and values > 1024 chars are rejected.`,
        };
      }
      safeHeaders[k] = valStr;
    }
  }

  // Validate request body
  let safeBody = null;
  if (body !== undefined && body !== null && body !== '') {
    if (!['POST', 'PUT', 'PATCH'].includes(normMethod)) {
      return {
        valid: false,
        statusCode: 400,
        error: `Request body is only allowed for POST, PUT, and PATCH methods.`,
      };
    }
    const bodyStr = typeof body === 'object' ? JSON.stringify(body) : String(body);
    if (Buffer.byteLength(bodyStr, 'utf8') > 65536) {
      return {
        valid: false,
        statusCode: 400,
        error: 'Request body must not exceed 64KB.',
      };
    }
    safeBody = bodyStr;
  }

  // Validate timeoutMs
  const finalTimeout = Number(timeoutMs);
  if (!Number.isInteger(finalTimeout) || finalTimeout < 500 || finalTimeout > 10000) {
    return {
      valid: false,
      statusCode: 400,
      error: 'Request timeout must be an integer between 500 and 10000 milliseconds.',
    };
  }

  let targetUrl;
  try {
    targetUrl = new URL(path, target.url);
  } catch {
    return {
      valid: false,
      statusCode: 400,
      error: 'Invalid target and path combination.',
    };
  }

  if (targetUrl.origin !== target.url) {
    return {
      valid: false,
      statusCode: 400,
      error: 'Endpoint path must remain on the registered target origin.',
    };
  }

  return {
    valid: true,
    data: {
      targetId: target.id,
      targetName: target.name,
      url: targetUrl.toString(),
      method: normMethod,
      concurrency: finalConcurrency,
      durationSec: finalDuration,
      profile: profile === 'stages' ? 'stages' : 'fixed',
      stages: validStages,
      headers: safeHeaders,
      body: safeBody,
      timeoutMs: finalTimeout,
    },
  };
}
