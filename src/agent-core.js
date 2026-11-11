'use strict';
// AgentLeash agent core: propose -> policy check -> (if ALLOW) sign with the
// SCOPED leash key -> broadcast a vault.pay call -> record in the ledger.
// The agent process only ever holds the function-call leash key. It has no
// access to any full-access key.
const { ACCOUNTS, accountFromKey, near } = require('./near');
const policy = require('./policy');

const GAS = near.teraToGas('30');

async function proposePayment({ to, amountNEAR, memo = '', dryRun = false }) {
  const amountYocto = near.nearToYocto(String(amountNEAR));
  const verdict = policy.evaluate({ recipient: to, amountYocto });
  const base = {
    proposal: { to, amountNEAR: String(amountNEAR), amountYocto: amountYocto.toString(), memo },
    policy: verdict,
  };
  if (verdict.decision === 'REJECT' || dryRun) {
    return { ...base, broadcast: null };
  }
  const agent = accountFromKey('agent-leash.json');
  const cfg = policy.loadPolicy();
  const out = await agent.callFunctionRaw({
    contractId: cfg.vaultContract,
    methodName: 'pay',
    args: { recipient: to, amount_yocto: amountYocto.toString(), memo },
    deposit: 0n,
    gas: GAS,
  });
  const txHash = out.transaction && out.transaction.hash;
  const failed = out.status && typeof out.status === 'object' && 'Failure' in out.status;
  if (!failed && txHash) {
    policy.recordSpend({
      ts: new Date().toISOString(),
      recipient: to,
      amountYocto: amountYocto.toString(),
      txHash,
    });
  }
  return {
    ...base,
    broadcast: { txHash, status: out.status, explorerUrl: `https://explorer.testnet.near.org/transactions/${txHash}` },
  };
}

module.exports = { proposePayment, ACCOUNTS };
