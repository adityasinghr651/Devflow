import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIPv4, isPrivateIPv6, validateTargetUrl } from '../../server/security/ssrf.js';

test('SSRF: isPrivateIPv4 detection', () => {
  assert.equal(isPrivateIPv4('127.0.0.1'), true);
  assert.equal(isPrivateIPv4('10.0.0.1'), true);
  assert.equal(isPrivateIPv4('192.168.1.1'), true);
  assert.equal(isPrivateIPv4('172.16.0.5'), true);
  assert.equal(isPrivateIPv4('172.31.255.255'), true);
  assert.equal(isPrivateIPv4('169.254.169.254'), true);
  assert.equal(isPrivateIPv4('100.64.0.1'), true);
  assert.equal(isPrivateIPv4('0.0.0.0'), true);
  assert.equal(isPrivateIPv4('224.0.0.1'), true);

  // Public IP addresses should return false
  assert.equal(isPrivateIPv4('8.8.8.8'), false);
  assert.equal(isPrivateIPv4('1.1.1.1'), false);
  assert.equal(isPrivateIPv4('93.184.216.34'), false);
});

test('SSRF: isPrivateIPv6 detection', () => {
  assert.equal(isPrivateIPv6('::1'), true);
  assert.equal(isPrivateIPv6('::'), true);
  assert.equal(isPrivateIPv6('fc00::1'), true);
  assert.equal(isPrivateIPv6('fd12:3456:789a::1'), true);
  assert.equal(isPrivateIPv6('fe80::1'), true);
  assert.equal(isPrivateIPv6('::ffff:127.0.0.1'), true);
});

test('SSRF: validateTargetUrl protocol & credentials', async () => {
  const ftp = await validateTargetUrl('ftp://example.com');
  assert.equal(ftp.valid, false);
  assert.match(ftp.error, /Only HTTP and HTTPS/);

  const creds = await validateTargetUrl('http://admin:secret@example.com');
  assert.equal(creds.valid, false);
  assert.match(creds.error, /credentials are not allowed/);
});

test('SSRF: validateTargetUrl cloud metadata blocked', async () => {
  const gcp = await validateTargetUrl('http://metadata.google.internal/computeMetadata');
  assert.equal(gcp.valid, false);
  assert.match(gcp.error, /metadata hostnames are blocked/);

  const awsIp = await validateTargetUrl('http://169.254.169.254/latest/meta-data/');
  assert.equal(awsIp.valid, false);
  assert.match(awsIp.error, /Private and link-local IP targets are blocked/);
});

test('SSRF: validateTargetUrl localhost handling', async () => {
  const allowed = await validateTargetUrl('http://localhost:3001', { allowLocalTargets: true });
  assert.equal(allowed.valid, true);
  assert.equal(allowed.url, 'http://localhost:3001');

  const blocked = await validateTargetUrl('http://localhost:3001', { allowLocalTargets: false });
  assert.equal(blocked.valid, false);
  assert.match(blocked.error, /Localhost targets are disabled/);
});

test('SSRF: bypass variants, injectable DNS, Unicode hostnames and rebinding are blocked safely', async () => {
  const blockedUrls = [
    'http://2130706433/',
    'http://0x7f000001/',
    'http://0177.0.0.1/',
    'http://127.0.0.1./',
    'http://localhost./',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:7f00:1]/',
    'http://0.0.0.0/',
    'http://169.254.169.254/',
    'http://good@127.0.0.1/',
  ];
  for (const url of blockedUrls) {
    const result = await validateTargetUrl(url, { allowLocalTargets: false, lookup: async () => [{ address: '8.8.8.8', family: 4 }] });
    assert.equal(result.valid, false, `${url} should be blocked`);
  }

  const privateDns = await validateTargetUrl('https://example.test/', {
    allowLocalTargets: false,
    lookup: async () => [{ address: '192.168.4.10', family: 4 }],
  });
  assert.equal(privateDns.valid, false);
  assert.match(privateDns.error, /restricted IP/);

  const unicode = await validateTargetUrl('https://例え.テスト/', {
    allowLocalTargets: false,
    lookup: async hostname => {
      assert.match(hostname, /xn--/);
      return [{ address: '8.8.8.8', family: 4 }];
    },
  });
  assert.equal(unicode.valid, true);

  let resolutionCount = 0;
  const rebindResolver = async () => {
    resolutionCount++;
    return [{ address: resolutionCount === 1 ? '93.184.216.34' : '127.0.0.1', family: 4 }];
  };
  assert.equal((await validateTargetUrl('https://rebind.test/', { allowLocalTargets: false, lookup: rebindResolver })).valid, true);
  const runtimeCheck = await validateTargetUrl('https://rebind.test/', { allowLocalTargets: false, lookup: rebindResolver });
  assert.equal(runtimeCheck.valid, false, 'worker pre-flight recheck must block the changed private DNS answer');
  assert.equal(isPrivateIPv6('::ffff:7f00:1'), true);
});

