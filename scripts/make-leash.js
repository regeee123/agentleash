'use strict';
// Creates the agent's scoped function-call keys ("the leash") on
// agent.agentleash2026.testnet:
//   - main leash:  may call ONLY vault.pay, allowance 1 NEAR total
//   - short leash: same scope, allowance 0.05 NEAR (for the exhaustion proof)
// The keypairs are saved to .keys/ (chmod 600). Only public keys are printed.
const { ACCOUNTS, accountFromKey, saveKey, near } = require('../src/near');

(async () => {
  const agentFull = accountFromKey('agent-full.json');

  const leash = near.KeyPair.fromRandom('ed25519');
  const out1 = await agentFull.addFunctionCallAccessKey({
    publicKey: leash.getPublicKey().toString(),
    contractId: ACCOUNTS.vault,
    methodNames: ['pay'],
    allowance: near.nearToYocto('1'),
  });
  saveKey('agent-leash.json', ACCOUNTS.agent, leash);
  console.log(
    `LEASH created pub=${leash.getPublicKey().toString()} scope=${ACCOUNTS.vault}:pay allowance=1 NEAR tx=${out1.transaction.hash}`
  );

  const short = near.KeyPair.fromRandom('ed25519');
  const out2 = await agentFull.addFunctionCallAccessKey({
    publicKey: short.getPublicKey().toString(),
    contractId: ACCOUNTS.vault,
    methodNames: ['pay'],
    allowance: near.nearToYocto('0.05'),
  });
  saveKey('agent-leash-short.json', ACCOUNTS.agent, short);
  console.log(
    `SHORT-LEASH created pub=${short.getPublicKey().toString()} scope=${ACCOUNTS.vault}:pay allowance=0.05 NEAR tx=${out2.transaction.hash}`
  );
})().catch((e) => {
  console.error('ERR', (e.message || String(e)).slice(0, 400));
  process.exit(1);
});
