#!/usr/bin/env node
// Setup script to create KV namespaces and update wrangler.toml IDs per environment.
// Usage: node tools/setup_wrangler.mjs [dev|staging|production]

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const wranglerTomlPath = resolve(repoRoot, 'wrangler.toml');

const envArg = (process.argv[2] || 'dev').toLowerCase();
const envName = envArg === 'dev' ? undefined : envArg; // undefined => default

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: ['inherit', 'pipe', 'inherit'], ...opts });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed`);
  }
  return res.stdout.toString();
}

function ensureWrangler() {
  try {
    const v = run('wrangler', ['--version']);
    console.log(`Found ${v.trim()}`);
  } catch (e) {
    console.error('Wrangler not found. Install with: npm i -g wrangler');
    process.exit(1);
  }
}

function createKvNamespace() {
  const args = ['kv', 'namespace', 'create', 'MEDIA_KV', '--json'];
  if (envName) args.push('--env', envName);
  const out = run('wrangler', args);
  const json = JSON.parse(out);
  const id = json.id || json.result?.id || json.success_result?.id;
  if (!id) throw new Error('Could not parse KV namespace id from wrangler output');
  return id;
}

function updateWranglerToml(envKey, kvId) {
  const toml = readFileSync(wranglerTomlPath, 'utf8');
  let updated = toml;
  if (!envKey) {
    // Top-level [[kv_namespaces]] binding = "MEDIA_KV"
    updated = updated.replace(/(\[\[kv_namespaces\]\][\s\S]*?binding\s*=\s*"MEDIA_KV"[\s\S]*?id\s*=\s*")(.*?)(")/m, `$1${kvId}$3`);
    if (updated === toml) {
      // No id line present; try inserting
      updated = updated.replace(/(\[\[kv_namespaces\]\][\s\S]*?binding\s*=\s*"MEDIA_KV".*?)(\r?\n)/m, `$1\nid = "${kvId}"$2`);
    }
  } else {
    const section = `[[env.${envKey}.kv_namespaces]]`;
    const re = new RegExp(`(${escapeRegex(section)}[\\s\\S]*?binding\\s*=\\s*"MEDIA_KV"[\\s\\S]*?id\\s*=\\s*")(.*?)(")`, 'm');
    if (re.test(updated)) {
      updated = updated.replace(re, `$1${kvId}$3`);
    } else {
      // Insert id under the section
      const secRe = new RegExp(`(${escapeRegex(section)}[\\s\\S]*?binding\\s*=\\s*"MEDIA_KV".*?)(\\r?\\n)`, 'm');
      updated = updated.replace(secRe, `$1\nid = "${kvId}"$2`);
    }
  }
  writeFileSync(wranglerTomlPath, updated);
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function main() {
  console.log(`Setting up KV for env: ${envName || 'default'}`);
  ensureWrangler();
  const kvId = createKvNamespace();
  console.log(`KV namespace id: ${kvId}`);
  updateWranglerToml(envName, kvId);
  console.log('Updated wrangler.toml with KV id.');
  console.log('\nNext, set secrets (per env):');
  console.log(`  wrangler secret put STREAM_API_TOKEN${envName ? ' --env ' + envName : ''}`);
  console.log(`  wrangler secret put STREAM_WEBHOOK_SECRET${envName ? ' --env ' + envName : ''}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

