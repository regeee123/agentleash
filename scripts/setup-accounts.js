'use strict';
// Creates + funds the AgentLeash subaccounts (idempotent: skips existing ones).
// Each new subaccount gets a fresh full-access keypair saved to .keys/ (chmod 600).
const fs = require('fs');
const path = require('path');
const { ACCOUNTS, accountFromKey, saveKey, near, KEYS_DIR } = require('../src/near');

const FUNDING = {
  agent: '4',
  vault: '1.5',
  shop: '0.05',
  lookalike: '0.05',
};
const KEYFILES = {
  agent: 'agent-full.json',
  vault: 'vault-full.json',
  shop: 'shop-full.json',
  lookalike: 'lookalike-full.json',
};

async function exists(id) {
  try {
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
  } catch {
    return false;
  }
}

(async () => {
  const owner = accountFromKey('owner.json');
  for (const name of ['agent', 'vault', 'shop', 'lookalike']) {
    const id = ACCOUNTS[name];
    const keyFile = KEYFILES[name];
    if (await exists(id)) {
      console.log(`SKIP ${id} (already exists)`);
      continue;
    }
    const kp = near.KeyPair.fromRandom('ed25519');
    const amount = near.nearToYocto(FUNDING[name]);
    const out = await owner.createSubAccount({
      accountOrPrefix: id,
      publicKey: kp.getPublicKey(),
      nearToTransfer: amount,
    });
    saveKey(keyFile, id, kp);
    console.log(
      `CREATED ${id} funded=${FUNDING[name]} NEAR tx=${out.transaction.hash} status=${JSON.stringify(out.status)}`
    );
  }
  console.log('done');
})().catch((e) => {
  console.error('ERR', e.message || e);
  process.exit(1);
});
