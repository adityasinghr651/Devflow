import net from 'node:net';
import dns from 'node:dns/promises';

export function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true;
  }
  const [b0, b1, b2, b3] = parts;

  // 0.0.0.0/8
  if (b0 === 0) return true;
  // 10.0.0.0/8
  if (b0 === 10) return true;
  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;
  // 100.64.0.0/10 (Carrier-Grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
  // 169.254.0.0/16 (Link-Local / Cloud metadata)
  if (b0 === 169 && b1 === 254) return true;
  // 172.16.0.0/12 (Private)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
  // 192.0.0.0/24 & 192.0.2.0/24 (Test/Documentation)
  if (b0 === 192 && b1 === 0 && (b2 === 0 || b2 === 2)) return true;
  // 192.168.0.0/16 (Private)
  if (b0 === 192 && b1 === 168) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;
  // 198.51.100.0/24 (TEST-NET-2)
  if (b0 === 198 && b1 === 51 && b2 === 100) return true;
  // 203.0.113.0/24 (TEST-NET-3)
  if (b0 === 203 && b1 === 0 && b2 === 113) return true;
  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (b0 >= 224) return true;

  return false;
}

export function isPrivateIPv6(ip) {
  const norm = ip.toLowerCase();
  if (norm === '::1' || norm === '::') return true;
  // Unique local addresses fc00::/7 (fc.. or fd..)
  if (norm.startsWith('fc') || norm.startsWith('fd')) return true;
  // Link-local addresses fe80::/10
  if (/^fe[89ab]/.test(norm)) return true;
  // IPv4-mapped IPv6
  if (norm.startsWith('::ffff:')) {
    const mapped = norm.replace('::ffff:', '');
    if (net.isIPv4(mapped)) {
      return isPrivateIPv4(mapped);
    }
  }
  return false;
}

export async function validateTargetUrl(rawUrl, { allowLocalTargets = true } = {}) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, error: 'Enter a valid target URL.' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: 'Only HTTP and HTTPS targets are supported.' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URLs containing credentials are not allowed.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block cloud metadata hostnames explicitly
  if (
    hostname === 'metadata.google.internal' ||
    hostname === 'metadata' ||
    hostname.endsWith('.internal') ||
    hostname === 'instance-data'
  ) {
    return { valid: false, error: 'Internal metadata hostnames are blocked.' };
  }

  const isLocalHost = hostname === 'localhost' || hostname.endsWith('.localhost');

  if (isLocalHost) {
    if (!allowLocalTargets) {
      return { valid: false, error: 'Localhost targets are disabled by configuration.' };
    }
    return { valid: true, url: parsed.origin };
  }

  const ipType = net.isIP(hostname);

  if (ipType === 4) {
    if (hostname.startsWith('127.') && allowLocalTargets) {
      return { valid: true, url: parsed.origin };
    }
    if (isPrivateIPv4(hostname)) {
      return { valid: false, error: 'Private and link-local IP targets are blocked by default.' };
    }
    return { valid: true, url: parsed.origin };
  }

  if (ipType === 6) {
    if ((hostname === '::1' || hostname === '[::1]') && allowLocalTargets) {
      return { valid: true, url: parsed.origin };
    }
    if (isPrivateIPv6(hostname)) {
      return { valid: false, error: 'Private and link-local IP targets are blocked by default.' };
    }
    return { valid: true, url: parsed.origin };
  }

  // Domain name: Resolve DNS to verify all destination IPs
  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (err) {
    return { valid: false, error: 'Target hostname could not be resolved.' };
  }

  if (!records || records.length === 0) {
    return { valid: false, error: 'Target hostname returned no address records.' };
  }

  for (const record of records) {
    const isLocal = (record.family === 4 && record.address.startsWith('127.')) ||
                    (record.family === 6 && record.address === '::1');
    if (isLocal && allowLocalTargets) {
      continue;
    }

    const isPrivate = record.family === 4
      ? isPrivateIPv4(record.address)
      : isPrivateIPv6(record.address);

    if (isPrivate) {
      return {
        valid: false,
        error: `Target resolves to restricted IP ${record.address} and is blocked.`
      };
    }
  }

  return { valid: true, url: parsed.origin };
}

