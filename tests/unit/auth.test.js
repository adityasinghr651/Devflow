import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  authRateLimiter,
} from '../../server/security/auth.js';

test('Auth: Password hashing and verification', async () => {
  const plain = 'SecurePassword123!';
  const hash = await hashPassword(plain);

  assert.notEqual(hash, plain);
  assert.ok(hash.startsWith('$2'));

  const valid = await verifyPassword(plain, hash);
  assert.equal(valid, true);

  const invalid = await verifyPassword('WrongPassword!', hash);
  assert.equal(invalid, false);

  await assert.rejects(
    async () => await hashPassword('short'),
    /Password must be at least 8 characters long/
  );
});

test('Auth: JWT token generation and verification', () => {
  const user = {
    id: 'user-uuid-1',
    email: 'engineer@servertest.local',
    name: 'Test Engineer',
    role: 'user',
  };

  const token = generateToken(user);
  assert.ok(token);

  const decoded = verifyToken(token);
  assert.equal(decoded.id, user.id);
  assert.equal(decoded.email, user.email);
  assert.equal(decoded.name, user.name);

  // Invalid token
  assert.throws(() => verifyToken('invalid.token.signature'), /invalid token/);
});

test('Auth: Expired token detection and rejection', async () => {
  const user = { id: 'user-uuid-expired', email: 'exp@test.local', name: 'Exp' };
  // Generate token that expires in 1ms
  const expiredToken = generateToken(user);
  // Verify with expired token rejection using jsonwebtoken directly with 0s expiry
  const jwt = (await import('jsonwebtoken')).default;
  const { config } = await import('../../server/config.js');
  const token = jwt.sign({ id: user.id }, config.jwtSecret, { expiresIn: -1 });

  assert.throws(() => verifyToken(token), (err) => err.name === 'TokenExpiredError');
});

test('Auth: Rate limiter blocks excessive requests', () => {
  let statusResult = 200;
  let jsonResult = null;

  const mockReq = { ip: '198.51.100.99', socket: {} };
  const mockRes = {
    status(code) {
      statusResult = code;
      return {
        json(data) {
          jsonResult = data;
        },
      };
    },
  };

  let nextCalledCount = 0;
  const mockNext = () => { nextCalledCount++; };

  // Make 10 allowed attempts
  for (let i = 0; i < 10; i++) {
    authRateLimiter(mockReq, mockRes, mockNext);
  }
  assert.equal(nextCalledCount, 10);

  // 11th attempt must be rejected with 429
  authRateLimiter(mockReq, mockRes, mockNext);
  assert.equal(statusResult, 429);
  assert.match(jsonResult.error, /Too many authentication attempts/);
});
