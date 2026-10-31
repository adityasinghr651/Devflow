import dns from 'node:dns/promises';
import { validateTargetUrl } from './ssrf.js';

export function isLocalhostTarget(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

/**
 * Verifies domain ownership for non-local targets.
 * Supports:
 * 1. DNS TXT record on _servertest.<hostname> with value servertest-verify=<token>
 * 2. HTTP .well-known challenge at /.well-known/servertest-challenge.txt containing <token>
 */
export async function verifyTargetOwnership(target, { allowLocalTargets = true } = {}) {
  const isLocal = isLocalhostTarget(target.url);

  // Local development targets are permitted when explicitly allowed by config
  if (isLocal) {
    if (!allowLocalTargets) {
      return {
        verified: false,
        error: 'Local targets are disabled by server configuration.',
      };
    }
    return {
      verified: true,
      method: 'local_development',
      verifiedAt: new Date().toISOString(),
    };
  }

  let parsed;
  try {
    parsed = new URL(target.url);
  } catch {
    return { verified: false, error: 'Invalid target URL.' };
  }

  const hostname = parsed.hostname;
  const token = target.verificationToken;
  if (!token) {
    return { verified: false, error: 'Missing target verification token.' };
  }

  const expectedChallenge = `servertest-verify=${token}`;

  // Method 1: Check DNS TXT Record at _servertest.<hostname>
  try {
    const txtDomain = `_servertest.${hostname}`;
    const records = await dns.resolveTxt(txtDomain).catch(() => []);
    const flatRecords = records.flat();

    const hasMatch = flatRecords.some(r =>
      r.trim() === expectedChallenge || r.trim() === token
    );

    if (hasMatch) {
      return {
        verified: true,
        method: 'dns_txt',
        verifiedAt: new Date().toISOString(),
      };
    }
  } catch (err) {
    // DNS TXT query failed, continue to fallback challenge
  }

  // Method 2: HTTP .well-known challenge probe
  try {
    const challengeUrl = new URL('/.well-known/servertest-challenge.txt', target.url).toString();

    // Enforce SSRF pre-check on challenge endpoint
    const ssrfCheck = await validateTargetUrl(challengeUrl, { allowLocalTargets });
    if (!ssrfCheck.valid) {
      return {
        verified: false,
        error: `Security verification blocked: ${ssrfCheck.error}`,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(challengeUrl, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'error', // Never follow redirects during verification
      headers: {
        'User-Agent': 'ServerTest-Verifier/1.0',
        'Accept': 'text/plain',
      },
    });

    clearTimeout(timeout);

    if (response.ok) {
      const text = (await response.text()).trim();
      if (text === token || text === expectedChallenge) {
        return {
          verified: true,
          method: 'well_known',
          verifiedAt: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    // Probe failed
  }

  return {
    verified: false,
    error: `Domain ownership verification failed for ${hostname}. Add a DNS TXT record at _servertest.${hostname} with value "${expectedChallenge}" or serve the token at /.well-known/servertest-challenge.txt`,
  };
}
