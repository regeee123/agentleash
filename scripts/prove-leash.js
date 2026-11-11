'use strict';
// AgentLeash on-chain proof (v2, float pattern) → evidence/leash-proof.json
//  A. both keys' permissions as stored on-chain (receiver=vault, methods=[pay])
//  B. allowed payment via the leash SUCCEEDS: vault float -> shop, 0.1 NEAR,
//     zero deposit; key allowance drops by gas only
//  C. call to a DIFFERENT contract with the leash -> chain rejects (receiver)
//  D. call to a FORBIDDEN METHOD (vault.set_paused) -> chain rejects (method)
//  E. micro leash (allowance < one call's prepaid gas) -> chain rejects (allowance)
//  F. payment above the CONTRACT per-payment cap (0.75 > 0.5 NEAR) -> contract rejects
//  G. vault stats afterwards: exactly one payment landed
const fs = require('fs');
const path = require('path');
const {
  ACCOUNTS,
  accountFromKey,
  loadKeyPair,
  viewAccessKey,
  viewCall,
  near,
  ROOT,
} = require('../src/near');

const GAS = near.teraToGas('30');

async function accountAmount(id) {
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
  return BigInt(j.result.amount);
}

function findExecutionError(out) {
  try {
    for (const r of out.receipts_outcome || []) {
      const st = r.outcome && r.outcome.status;
      if (st && st.Failure) return JSON.stringify(st.Failure).slice(0, 400);
    }
    if (out.status && out.status.Failure) return JSON.stringify(out.status.Failure).slice(0, 400);
  } catch {}
  return null;
}

async function attempt(fn, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const out = await fn();
      const execErr = findExecutionError(out);
      return {
        threw: false,
        txHash: out.transaction && out.transaction.hash,
        status: out.status,
        executionError: execErr,
      };
    } catch (e) {
      lastErr = e;
      const msg = e.message || String(e);
      if (!/RetriesExceeded|fetch failed|timeout|ECONN|socket/i.test(msg) || i === retries - 1) {
        return { threw: true, errorType: e.type || e.name || 'Error', error: msg.slice(0, 500) };
      }
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
  return { threw: true, errorType: 'RetriesExceeded', error: String(lastErr && lastErr.message).slice(0, 500) };
}

(async () => {
  const ev = {
    generatedAt: new Date().toISOString(),
    network: 'testnet',
    agentAccount: ACCOUNTS.agent,
    vaultContract: ACCOUNTS.vault,
    architecture: 'float pattern v2 (function-call keys cannot attach deposits)',
    checks: [],
  };
  const leashPub = loadKeyPair('agent-leash.json').keyPair.getPublicKey().toString();
  const microPub = loadKeyPair('agent-leash-micro.json').keyPair.getPublicKey().toString();
  ev.leashPublicKey = leashPub;
  ev.microLeashPublicKey = microPub;

  // A
  const keyView = await viewAccessKey(ACCOUNTS.agent, leashPub);
  const microView = await viewAccessKey(ACCOUNTS.agent, microPub);
  ev.checks.push({
    id: 'A_key_permissions_on_chain',
    leash: keyView.permission,
    microLeash: microView.permission,
  });
  console.log('A. leash:', JSON.stringify(keyView.permission));
  console.log('A. micro:', JSON.stringify(microView.permission));

  const leashAgent = accountFromKey('agent-leash.json');
  const shopBefore = await accountAmount(ACCOUNTS.shop);

  // B
  const b = await attempt(() =>
    leashAgent.callFunctionRaw({
      contractId: ACCOUNTS.vault,
      methodName: 'pay',
      args: { recipient: ACCOUNTS.shop, amount_yocto: near.nearToYocto('0.1').toString(), memo: 'leash-proof-allowed' },
      deposit: 0n,
      gas: GAS,
    })
  );
  const keyAfter = await viewAccessKey(ACCOUNTS.agent, leashPub);
  const shopAfter = await accountAmount(ACCOUNTS.shop);
  ev.checks.push({
    id: 'B_allowed_payment_succeeds',
    result: b,
    shopReceivedYocto: (shopAfter - shopBefore).toString(),
    allowanceBeforeYocto: keyView.permission.FunctionCall.allowance,
    allowanceAfterYocto: keyAfter.permission.FunctionCall.allowance,
  });
  console.log('B. allowed pay:', JSON.stringify(b).slice(0, 200), 'shop received:', (shopAfter - shopBefore).toString());

  // C
  const c = await attempt(() =>
    leashAgent.callFunctionRaw({
      contractId: ACCOUNTS.shop,
      methodName: 'pay',
      args: { recipient: ACCOUNTS.shop, amount_yocto: '1' },
      deposit: 0n,
      gas: GAS,
    })
  );
  ev.checks.push({ id: 'C_wrong_contract_rejected', result: c });
  console.log('C. wrong contract:', JSON.stringify(c).slice(0, 200));

  // D
  const d = await attempt(() =>
    leashAgent.callFunctionRaw({
      contractId: ACCOUNTS.vault,
      methodName: 'set_paused',
      args: { paused: true },
      deposit: 0n,
      gas: GAS,
    })
  );
  ev.checks.push({ id: 'D_forbidden_method_rejected', result: d });
  console.log('D. forbidden method:', JSON.stringify(d).slice(0, 200));

  // E
  const microAgent = accountFromKey('agent-leash-micro.json');
  const e2 = await attempt(() =>
    microAgent.callFunctionRaw({
      contractId: ACCOUNTS.vault,
      methodName: 'pay',
      args: { recipient: ACCOUNTS.shop, amount_yocto: near.nearToYocto('0.01').toString(), memo: 'micro' },
      deposit: 0n,
      gas: GAS,
    })
  );
  ev.checks.push({ id: 'E_allowance_cap_enforced', result: e2 });
  console.log('E. micro leash pay:', JSON.stringify(e2).slice(0, 200));

  // F
  const f = await attempt(() =>
    leashAgent.callFunctionRaw({
      contractId: ACCOUNTS.vault,
      methodName: 'pay',
      args: { recipient: ACCOUNTS.shop, amount_yocto: near.nearToYocto('0.75').toString(), memo: 'over-contract-cap' },
      deposit: 0n,
      gas: GAS,
    })
  );
  ev.checks.push({ id: 'F_contract_per_payment_cap', result: f });
  console.log('F. 0.75 NEAR over contract cap:', JSON.stringify(f).slice(0, 260));

  // G
  const stats = await viewCall(ACCOUNTS.vault, 'get_stats', {});
  ev.checks.push({ id: 'G_vault_stats_after', stats });
  console.log('G. stats:', JSON.stringify(stats));

  const outPath = path.join(ROOT, 'evidence', 'leash-proof.json');
  fs.writeFileSync(outPath, JSON.stringify(ev, null, 2));
  console.log('evidence written:', outPath);
})().catch((e) => {
  console.error('ERR', (e.message || String(e)).slice(0, 400));
  process.exit(1);
});
