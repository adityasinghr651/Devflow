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

