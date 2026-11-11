import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../server/app.js';
import { JsonStorage } from '../../server/storage/json-storage.js';
import { setStorage } from '../../server/storage/index.js';
import { generateToken, hashPassword } from '../../server/security/auth.js';
import { randomUUID } from 'node:crypto';
import { createTestPassword } from '../helpers/test-credentials.js';
import { config } from '../../server/config.js';

config.authRateLimitMax = 100;
import { setRunnerManager } from '../../server/runner/manager.js';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-auth-flows-'));
  const storage = new JsonStorage(dir); await storage.init(); setStorage(storage);
  setRunnerManager({ enqueueRun: async () => {} });
  const server = http.createServer(createApp());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  t.after(async () => { setRunnerManager(null); await new Promise(resolve => server.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); });
  return { base, storage };
}

test('OAuth rejects email-only identity claims (regression reproduction)', async t => {
  const { base } = await fixture(t);
  const registration = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Victim', email: 'victim@example.com', password: createTestPassword() }) });
  assert.equal(registration.status, 201);
  const exploit = await fetch(`${base}/auth/oauth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'github', email: 'victim@example.com' }) });
  assert.equal(exploit.status, 400);
  assert.equal((await exploit.json()).token, undefined);
});

test('Signup validates fields, rejects duplicates, and accepts matching credentials', async t => {
  const { base } = await fixture(t);
  const password = createTestPassword();
  const otherPassword = createTestPassword();
  const wrongPassword = createTestPassword();
  const post = (route, body) => fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post('/auth/register', { name:'Weak',email:'weak@example.com',password:'short' })).status, 400);
  assert.equal((await post('/auth/register', { name:'Weak',email:'common@example.com',password:'Password123!' })).status, 400);
  const registration = await post('/auth/register', { name:'User',email:'same@example.com',password,role:'admin',tier:'admin' });
  assert.equal(registration.status, 201);
  const initial = await registration.clone().json(); assert.equal(initial.user.tier,'free'); assert.equal(initial.user.role,'user');
  const duplicate = await post('/auth/register', { name:'User 2',email:'SAME@example.com',password:otherPassword });
  assert.equal(duplicate.status, 409); assert.equal((await duplicate.json()).field, 'email');
  assert.equal((await post('/auth/login', { email:'same@example.com',password:wrongPassword })).status, 401);
  const login = await post('/auth/login', { email:'same@example.com',password });
  assert.equal(login.status, 200); assert.equal((await login.json()).user.tier, 'free');
});

test('First administrator bootstrap is one-time under concurrent attempts', async t => {
  const { storage } = await fixture(t);
  const create = email => storage.createFirstAdmin({ email, name:'Bootstrap Admin', passwordHash:'already-validated-hash' });
  const results = await Promise.allSettled([create('first-admin@example.com'), create('second-admin@example.com')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await storage.listUsers()).filter(account => account.role === 'admin').length, 1);
});

test('GitHub OAuth exchanges one-time state-bound code and rejects tampering', async t => {
  const { base, storage } = await fixture(t);
  const oldFetch = globalThis.fetch; const oldId = process.env.GITHUB_CLIENT_ID; const oldSecret = process.env.GITHUB_CLIENT_SECRET; const oldGoogleId = process.env.GOOGLE_CLIENT_ID; const oldGoogleSecret = process.env.GOOGLE_CLIENT_SECRET;
  process.env.GITHUB_CLIENT_ID = 'mock-client'; process.env.GITHUB_CLIENT_SECRET = 'mock-secret';
  process.env.GOOGLE_CLIENT_ID = 'mock-google-client'; process.env.GOOGLE_CLIENT_SECRET = 'mock-google-secret';
  let githubIdentityId='7654321'; let githubEmail='oauth@example.com';
  globalThis.fetch = async (url, options) => {
    const address = String(url);
    if (address.includes('github.com/login/oauth/access_token')) return Response.json({ access_token:'mock-provider-token' });
    if (address.endsWith('/user/emails')) return Response.json([{ email:githubEmail,primary:true,verified:true }]);
    if (address.endsWith('/user')) return Response.json({ id:githubIdentityId,login:'oauth-user',name:'OAuth User' });
    if (address.includes('oauth2.googleapis.com/token')) return Response.json({ access_token:'mock-google-token' });
    if (address.includes('openidconnect.googleapis.com/v1/userinfo')) return Response.json({ sub:'google-user-123',email:'google-oauth@example.com',email_verified:true,name:'Google OAuth User' });
    return oldFetch(url, options);
  };
  t.after(() => { globalThis.fetch = oldFetch; if (oldId === undefined) delete process.env.GITHUB_CLIENT_ID; else process.env.GITHUB_CLIENT_ID = oldId; if (oldSecret === undefined) delete process.env.GITHUB_CLIENT_SECRET; else process.env.GITHUB_CLIENT_SECRET = oldSecret; if (oldGoogleId === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = oldGoogleId; if (oldGoogleSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET; else process.env.GOOGLE_CLIENT_SECRET = oldGoogleSecret; });
  const start = await fetch(`${base}/auth/oauth/github/start`, { redirect:'manual' });
  assert.equal(start.status, 302);
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const cookie = start.headers.get('set-cookie').split(';')[0];
  const callback = await fetch(`${base}/auth/oauth/github/callback`, { method:'POST', headers:{ Cookie:cookie,'Content-Type':'application/json' }, body:JSON.stringify({ code:'mock-code',state }) });
  assert.equal(callback.status, 200); const signedIn = await callback.json(); assert.ok(signedIn.token); assert.equal(signedIn.user.tier,'free');
  assert.equal((await storage.listUsers()).filter(user => user.oauthProvider === 'github').length, 1);
  const googleStart = await fetch(`${base}/auth/oauth/google/start`, { redirect:'manual' }); const googleState = new URL(googleStart.headers.get('location')).searchParams.get('state');
  const googleCallback = await fetch(`${base}/auth/oauth/google/callback`, { method:'POST', headers:{Cookie:googleStart.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json'}, body:JSON.stringify({code:'mock-google-code',state:googleState}) });
  assert.equal(googleCallback.status, 200); assert.equal((await googleCallback.json()).user.email, 'google-oauth@example.com');
  const secondStart = await fetch(`${base}/auth/oauth/github/start`, { redirect:'manual' });
  const secondState = new URL(secondStart.headers.get('location')).searchParams.get('state');
  const secondCookie = secondStart.headers.get('set-cookie').split(';')[0];
  const badState = await fetch(`${base}/auth/oauth/github/callback`, { method:'POST',headers:{Cookie:secondCookie,'Content-Type':'application/json'},body:JSON.stringify({code:'mock-code',state:`${secondState}tampered`}) });
  assert.equal(badState.status, 400);
  const thirdStart = await fetch(`${base}/auth/oauth/github/start`, { redirect:'manual' });
  const thirdState = new URL(thirdStart.headers.get('location')).searchParams.get('state');
  const missingCode = await fetch(`${base}/auth/oauth/github/callback`, { method:'POST',headers:{Cookie:thirdStart.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json'},body:JSON.stringify({state:thirdState}) });
  assert.equal(missingCode.status, 400);
  await storage.createUser({ email:'already-password@example.com',name:'Password Account',passwordHash:await hashPassword(`${randomUUID()}!Aa9`) });
  githubIdentityId='other-provider-id'; githubEmail='already-password@example.com';
  const linkStart=await fetch(`${base}/auth/oauth/github/start`,{redirect:'manual'}); const linkState=new URL(linkStart.headers.get('location')).searchParams.get('state');
  const collision=await fetch(`${base}/auth/oauth/github/callback`,{method:'POST',headers:{Cookie:linkStart.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json'},body:JSON.stringify({code:'mock-code',state:linkState})});
  assert.equal(collision.status,409); assert.equal((await collision.json()).token,undefined);
});

test('Demo/free run quotas and paid/admin delete permissions are enforced by API', async t => {
  const { base, storage } = await fixture(t);
  const signup = await fetch(`${base}/auth/register`, { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Free',email:'free@example.com',password:createTestPassword()}) });
  const free = await signup.json();
  const target = await storage.createTarget({ userId:free.user.id,name:'Local',url:`http://127.0.0.1:${new URL(base).port}`,verified:true,environment:'Development' });
  const seedRun = async userId => storage.createRun({userId,targetId:target.id,targetName:target.name,url:target.url,method:'GET',concurrency:1,durationSec:1,status:'completed',startedAt:new Date().toISOString(),totalRequests:0,successCount:0,failedCount:0,rps:0,p50:0,p95:0,p99:0,errorRate:0,statusCodes:{}});
  for (let i=0;i<14;i++) await seedRun(free.user.id);
  const runBody = { targetId:target.id,path:'/api/v1/health',method:'GET',concurrency:1,durationSec:1,authorized:true };
  const makeRun = (token, cookie='') => fetch(`${base}/runs`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(runBody)});
  const fifteenth = await makeRun(free.token); assert.equal(fifteenth.status,202, JSON.stringify(await fifteenth.clone().json()));
  assert.equal((await makeRun(free.token)).status,429);
  const oldRun = (await storage.getRuns(free.user.id)).find(run => run.status === 'completed');
  const freeDelete = await fetch(`${base}/runs/${oldRun.id}`,{method:'DELETE',headers:{Authorization:`Bearer ${free.token}`}}); assert.equal(freeDelete.status,403);
  await storage.updateUser(free.user.id,{tier:'paid',plan:'pro'});
  const paid = generateToken({...free.user,tier:'paid',plan:'pro'});
  assert.equal((await makeRun(paid)).status,202);
  const paidDelete = await fetch(`${base}/runs/${oldRun.id}`,{method:'DELETE',headers:{Authorization:`Bearer ${paid}`}}); assert.equal(paidDelete.status,200);
  const admin = await storage.createUser({email:'admin@example.com',name:'Admin',passwordHash:await hashPassword(`${randomUUID()}!Aa9`),role:'admin',tier:'admin',plan:'admin'});
  await storage.updateUser(admin.id,{lifetimeRuns:20000});
  const adminToken = generateToken(admin);
  assert.equal((await fetch(`${base}/admin/stats`,{headers:{Authorization:`Bearer ${free.token}`}})).status,403);
  assert.equal((await fetch(`${base}/admin/stats`,{headers:{Authorization:`Bearer ${paid}`}})).status,403);
  assert.equal((await fetch(`${base}/admin/stats`,{headers:{Authorization:`Bearer ${adminToken}`} })).status,200);
  assert.equal((await fetch(`${base}/admin/users`,{headers:{Authorization:`Bearer ${adminToken}`} })).status,200);
  assert.equal((await fetch(`${base}/admin/stats`)).status,401);
  const adminTarget=await storage.createTarget({userId:admin.id,name:'Admin target',url:`http://127.0.0.1:${new URL(base).port}`,verified:true,environment:'Development'});
  assert.equal((await fetch(`${base}/runs`,{method:'POST',headers:{Authorization:`Bearer ${adminToken}`,'Content-Type':'application/json'},body:JSON.stringify({...runBody,targetId:adminTarget.id})})).status,202);
  const anotherRun = await seedRun(free.user.id);
  assert.equal((await fetch(`${base}/runs/${anotherRun.id}`,{method:'DELETE',headers:{Authorization:`Bearer ${adminToken}`}})).status,200);
  const downgradeRun = await seedRun(free.user.id);
  await storage.updateUser(free.user.id,{tier:'free',plan:'free'});
  assert.equal((await fetch(`${base}/runs/${downgradeRun.id}`,{method:'DELETE',headers:{Authorization:`Bearer ${paid}`}})).status,403);
});

test('Demo cookie session is server-issued and enforces session run quota', async t => {
  const { base, storage } = await fixture(t);
  const response = await fetch(`${base}/auth/demo`,{method:'POST'}); assert.equal(response.status,201);
  const { user } = await response.json(); const cookie = response.headers.get('set-cookie').split(';')[0];
  assert.match(response.headers.get('set-cookie'),/HttpOnly/);
  const target = await storage.createTarget({userId:user.id,name:'Local demo',url:`http://127.0.0.1:${new URL(base).port}`,verified:true,environment:'Development'});
  for(let i=0;i<9;i++) await storage.createRun({userId:user.id,targetId:target.id,targetName:target.name,url:target.url,method:'GET',concurrency:1,durationSec:1,status:'completed',startedAt:new Date().toISOString(),totalRequests:0,successCount:0,failedCount:0,rps:0,p50:0,p95:0,p99:0,errorRate:0,statusCodes:{}});
  const payload={targetId:target.id,path:'/api/v1/health',method:'GET',concurrency:1,durationSec:1,authorized:true};
  const make=()=>fetch(`${base}/runs`,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  assert.equal((await make()).status,202); assert.equal((await make()).status,429);
  const ipHash = Object.keys(storage.store.demoIpUsage)[0];
  storage.store.demoIpUsage[ipHash].runCount = 10;
  const secondSession = await fetch(`${base}/auth/demo`,{method:'POST'}); const secondCookie=secondSession.headers.get('set-cookie').split(';')[0]; const secondUser=(await secondSession.json()).user;
  const secondTarget=await storage.createTarget({userId:secondUser.id,name:'Second local demo',url:`http://127.0.0.1:${new URL(base).port}`,verified:true,environment:'Development'});
  const ipLimited=await fetch(`${base}/runs`,{method:'POST',headers:{Cookie:secondCookie,'Content-Type':'application/json'},body:JSON.stringify({...payload,targetId:secondTarget.id})});
  assert.equal(ipLimited.status,429);
  await storage.updateUser(user.id,{demoExpiresAt:new Date(0).toISOString()});
  await storage.createAuditEvent({userId:user.id,action:'DEMO_TEST'});
  assert.equal(await storage.cleanupExpiredDemoUsers(),1);
  assert.equal(await storage.getUserById(user.id),null);
  assert.equal((await storage.getRuns(user.id)).length,0);
});
