'use strict';
// Resets the vault account for the v2 (float-pattern) contract:
//   1. deletes vault.agentleash2026.testnet (balance returns to owner)
//   2. recreates it with a fresh full-access key, funded 1.5 NEAR
//   3. deploys PaymentVault v2, inits it (owner = parent, cap = 0.5 NEAR)
//   4. funds the float: owner transfers 2 NEAR to the vault account
// Needed because v2 changes the contract state layout (old state is unreadable).
const fs = require('fs');
const path = require('path');
const { ACCOUNTS, accountFromKey, saveKey, viewCall, near, ROOT } = require('../src/near');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function accountExists(id) {
  const res = await fetch('https://rpc.testnet.near.org', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'q',
      method: 'query',
      params: { request_type: 'view_account', finality: 'final', account_id: id },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json();
  return !!j.result;
}

(async () => {
  const vaultId = ACCOUNTS.vault;
  const owner = accountFromKey('owner.json');

  if (await accountExists(vaultId)) {
    const vaultOld = accountFromKey('vault-full.json');
    const del = await vaultOld.deleteAccount(ACCOUNTS.owner);
    console.log(`DELETED old vault tx=${del.transaction.hash}`);
    for (let i = 0; i < 10 && (await accountExists(vaultId)); i++) await sleep(3000);
  }

  const kp = near.KeyPair.fromRandom('ed25519');
  const create = await owner.createSubAccount({
    accountOrPrefix: vaultId,
    publicKey: kp.getPublicKey(),
    nearToTransfer: near.nearToYocto('1.5'),
  });
  saveKey('vault-full.json', vaultId, kp);
  console.log(`RECREATED ${vaultId} tx=${create.transaction.hash}`);

  const vault = accountFromKey('vault-full.json');
  const wasm = fs.readFileSync(
    path.join(ROOT, 'contract-rs', 'payment-vault', 'target', 'wasm32-unknown-unknown', 'release', 'payment_vault.wasm')
  );
  const dep = await vault.deployContract(new Uint8Array(wasm));
  console.log(`DEPLOYED v2 tx=${dep.transaction.hash} status=${JSON.stringify(dep.status)}`);

  const init = await owner.callFunction({
    contractId: vaultId,
    methodName: 'init',
    args: { owner: ACCOUNTS.owner, max_per_payment_yocto: near.nearToYocto('0.5').toString() },
    gas: near.teraToGas('30'),
  });
  console.log('INIT v2 ok:', JSON.stringify(init));

  const fund = await owner.signAndSendTransaction({
    receiverId: vaultId,
    actions: [near.actions.transfer(near.nearToYocto('2'))],
  });
  console.log(`FLOAT funded 2 NEAR tx=${fund.transaction.hash} status=${JSON.stringify(fund.status)}`);

  const stats = await viewCall(vaultId, 'get_stats', {});
  console.log('get_stats:', JSON.stringify(stats));
})().catch((e) => {
  console.error('ERR', (e.message || String(e)).slice(0, 400));
  process.exit(1);
});
