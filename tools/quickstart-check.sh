#!/usr/bin/env bash
set -euo pipefail
if ! command -v node >/dev/null 2>&1 && command -v node.exe >/dev/null 2>&1; then
  node() { node.exe "$@"; }
  export -f node
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if ! command -v node >/dev/null 2>&1 && command -v powershell.exe >/dev/null 2>&1 && command -v wslpath >/dev/null 2>&1; then
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "$ROOT/tools/quickstart-check.ps1")"
  exit $?
fi
TMP="$(mktemp -d)"
export API_PORT="${QUICKSTART_API_PORT:-4173}" DATA_DIR="$TMP/data" API_HOST=127.0.0.1 ALLOW_LOCAL_TARGETS=true JWT_SECRET=quickstart-check-secret-that-is-long-enough
target_pid=""; api_pid=""
cleanup() { [[ -z "$api_pid" ]] || kill "$api_pid" 2>/dev/null || true; [[ -z "$target_pid" ]] || kill "$target_pid" 2>/dev/null || true; wait "$api_pid" 2>/dev/null || true; wait "$target_pid" 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT
cd "$ROOT"
started=$(date +%s)
npm ci --ignore-scripts
node tools/test-target.js 5050 >"$TMP/target.log" 2>&1 & target_pid=$!
node server.js >"$TMP/api.log" 2>&1 & api_pid=$!
node --input-type=module <<'NODE'
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const base = `http://127.0.0.1:${process.env.API_PORT}/api/v1`;
const password = `Df!${randomBytes(24).toString('base64url')}9A`;
async function ready(url) { for (let i=0;i<80;i++) { try { const r=await fetch(url); if(r.ok)return; } catch {} await new Promise(r=>setTimeout(r,250)); } throw Error(`Service did not become ready: ${url}`); }
await ready('http://127.0.0.1:5050/health'); await ready(`${base}/ready`);
const call=async(path,options={})=>{const r=await fetch(`${base}${path}`,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});const data=await r.json();if(!r.ok)throw Error(`${path} ${r.status}: ${JSON.stringify(data)}`);return data;};
const user=await call('/auth/register',{method:'POST',body:JSON.stringify({name:'Quickstart',email:`quick-${Date.now()}@example.test`,password})});
const auth={Authorization:`Bearer ${user.token}`};
const target=await call('/targets',{method:'POST',headers:auth,body:JSON.stringify({name:'Quickstart target',url:'http://127.0.0.1:5050',environment:'local'})});
const configPath=`${process.env.DATA_DIR}/devflow.config.json`;
await fs.writeFile(configPath,JSON.stringify({apiUrl:base,targetId:target.id,path:'/health',method:'GET',concurrency:2,durationSec:2,workerCount:1,authorized:true}));
const checked=spawnSync(process.execPath,['bin/devflow.js','check','--config',configPath,'--json'],{encoding:'utf8',env:{...process.env,DEVFLOW_TOKEN:user.token}});
if(checked.status!==0)throw Error(`devflow check failed (${checked.status}): ${checked.stderr}`);
const report=JSON.parse(checked.stdout);
if(report.status!=='completed')throw Error(`Run did not complete: ${report.status}`);
console.log(JSON.stringify({status:report.status,runId:report.runId,totalRequests:report.totalRequests,successCount:report.successCount,failedCount:report.failedCount,regressionVerdict:report.regression.verdict}));
NODE
echo "Quickstart elapsed: $(( $(date +%s) - started )) seconds"
