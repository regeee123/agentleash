'use strict';
// Deploys PaymentVault to vault.agentleash2026.testnet and initializes it.
// Idempotent: skips deploy if code is already on the account.
const fs = require('fs');
const path = require('path');
const { ACCOUNTS, accountFromKey, viewCall, near, ROOT } = require('../src/near');

const NO_CODE_HASH = '11111111111111111111111111111111';

async function codeHash(accountId) {
  const res = await fetch('https://rpc.testnet.near.org', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'q',
      method: 'query',
      params: { request_type: 'view_account', finality: 'final', account_id: accountId },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json();
  return j.result && j.result.code_hash;
}

(async () => {
  const vaultId = ACCOUNTS.vault;
  const existing = await codeHash(vaultId);
  const vault = accountFromKey('vault-full.json');
  if (existing && existing !== NO_CODE_HASH) {
    console.log(`SKIP deploy: code already present (code_hash=${existing})`);
  } else {
    const wasm = fs.readFileSync(
      path.join(ROOT, 'contract-rs', 'payment-vault', 'target', 'wasm32-unknown-unknown', 'release', 'payment_vault.wasm')
    );
    const out = await vault.deployContract(new Uint8Array(wasm));
    console.log(`DEPLOYED tx=${out.transaction.hash} status=${JSON.stringify(out.status)}`);
  }
  // Initialize (fails harmlessly if already initialized — catch and report).
  const owner = accountFromKey('owner.json');
  try {
    const out = await owner.callFunction({
      contractId: vaultId,
      methodName: 'init',
      args: { owner: ACCOUNTS.owner },
      gas: near.teraToGas('30'),
    });
    console.log('INIT ok:', JSON.stringify(out));
  } catch (e) {
    console.log('INIT skipped/failed (likely already initialized):', (e.message || String(e)).slice(0, 200));
  }
  const stats = await viewCall(vaultId, 'get_stats', {});
  console.log('get_stats:', JSON.stringify(stats));
})().catch((e) => {
  console.error('ERR', (e.message || String(e)).slice(0, 400));
  process.exit(1);
});
