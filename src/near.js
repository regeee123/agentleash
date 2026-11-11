'use strict';
// Shared NEAR testnet helpers for AgentLeash.
// Keys are read from .keys/*.json (near-cli legacy format) — never printed.
const fs = require('fs');
const path = require('path');
const near = require('near-api-js');

const ROOT = path.join(__dirname, '..');
const KEYS_DIR = path.join(ROOT, '.keys');

const NETWORK = 'testnet';
const RPC_URLS = [
  'https://rpc.testnet.near.org',
  'https://near-testnet.drpc.org',
  'https://archival-rpc.testnet.near.org',
];

const ACCOUNTS = {
  owner: 'agentleash2026.testnet',
  agent: 'agent.agentleash2026.testnet',
  vault: 'vault.agentleash2026.testnet',
  shop: 'shop.agentleash2026.testnet',
  lookalike: 'shops.agentleash2026.testnet',
};

function provider() {
  // Single endpoint: the FailoverRpcProvider burned all retries on broadcasts
  // when one endpoint lagged (observed 2026-11-11). rpc.testnet.near.org has
  // been the most reliable from this VM; scripts add their own retry loops.
  return new near.JsonRpcProvider({ url: RPC_URLS[0] });
}

function loadKeyPair(keyFile) {
  const raw = JSON.parse(fs.readFileSync(path.join(KEYS_DIR, keyFile), 'utf8'));
  const secret = raw.private_key || raw.secret_key;
  if (!secret) throw new Error(`No private key in ${keyFile}`);
  return { keyPair: near.KeyPair.fromString(secret), accountId: raw.account_id };
}

// Returns a near-api-js Account bound to a signer from a key file.
function accountFromKey(keyFile, accountIdOverride) {
  const { keyPair, accountId } = loadKeyPair(keyFile);
  const signer = new near.KeyPairSigner(keyPair);
  return new near.Account(accountIdOverride || accountId, provider(), signer);
}

// Read-only account (no signer) for views.
function viewAccount(accountId) {
  return new near.Account(accountId, provider());
}

function saveKey(keyFile, accountId, keyPair) {
  const p = path.join(KEYS_DIR, keyFile);
  fs.writeFileSync(
    p,
    JSON.stringify(
      {
        account_id: accountId,
        public_key: keyPair.getPublicKey().toString(),
        private_key: keyPair.toString(),
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  fs.chmodSync(p, 0o600);
}

// Contract view call via raw JSON-RPC (robust against SDK param-shape drift).
async function viewCall(contractId, methodName, args = {}, tries = 4) {
  const argsBase64 = Buffer.from(JSON.stringify(args)).toString('base64');
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch('https://rpc.testnet.near.org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'q',
          method: 'query',
          params: {
            request_type: 'call_function',
            finality: 'final',
            account_id: contractId,
            method_name: methodName,
            args_base64: argsBase64,
          },
        }),
        signal: AbortSignal.timeout(30000),
      });
      const j = await res.json();
      if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 300));
      const text = Buffer.from(j.result.result).toString('utf8');
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

// Raw view of an access key (for leash evidence).
async function viewAccessKey(accountId, publicKey, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch('https://rpc.testnet.near.org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'q',
          method: 'query',
          params: {
            request_type: 'view_access_key',
            finality: 'final',
            account_id: accountId,
            public_key: publicKey,
          },
        }),
        signal: AbortSignal.timeout(30000),
      });
      const j = await res.json();
      if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 300));
      return j.result;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

module.exports = {
  near,
  NETWORK,
  ACCOUNTS,
  KEYS_DIR,
  viewCall,
  viewAccessKey,
  provider,
  accountFromKey,
  viewAccount,
  saveKey,
  loadKeyPair,
  ROOT,
};
