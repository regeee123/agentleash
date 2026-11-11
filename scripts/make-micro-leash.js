'use strict';
// Replaces the 0.05-NEAR short leash with a MICRO leash (allowance 0.001 NEAR):
// too small to cover even one call's prepaid gas — used to prove the chain
// enforces the allowance cap. The main leash (1 NEAR gas budget) is untouched.
const { ACCOUNTS, accountFromKey, loadKeyPair, saveKey, near } = require('../src/near');

(async () => {
  const agentFull = accountFromKey('agent-full.json');

  const shortPub = loadKeyPair('agent-leash-short.json').keyPair.getPublicKey().toString();
  const del = await agentFull.deleteKey(shortPub);
  console.log(`DELETED short leash ${shortPub} tx=${del.transaction.hash}`);

  const micro = near.KeyPair.fromRandom('ed25519');
  const out = await agentFull.addFunctionCallAccessKey({
    publicKey: micro.getPublicKey().toString(),
    contractId: ACCOUNTS.vault,
    methodNames: ['pay'],
    allowance: near.nearToYocto('0.001'),
  });
  saveKey('agent-leash-micro.json', ACCOUNTS.agent, micro);
  console.log(
    `MICRO-LEASH created pub=${micro.getPublicKey().toString()} scope=${ACCOUNTS.vault}:pay allowance=0.001 NEAR tx=${out.transaction.hash}`
  );
})().catch((e) => {
  console.error('ERR', (e.message || String(e)).slice(0, 400));
  process.exit(1);
});
