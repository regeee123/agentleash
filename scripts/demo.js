'use strict';
// The AgentLeash demo: three scripted proposals through the real agent.
//   1. legit small payment to the allowlisted shop   -> ALLOW + on-chain tx
//   2. payment above the per-transaction cap          -> policy REJECT, no tx
//   3. payment to a scam lookalike of the shop        -> policy REJECT, no tx
// Output is printed for screenshots and saved to evidence/demo.json.
const fs = require('fs');
const path = require('path');
const { proposePayment } = require('../src/agent-core');
const { ACCOUNTS, viewCall, ROOT } = require('../src/near');

(async () => {
  const scenarios = [
    {
      id: '1_legit_payment',
      title: 'Legit payment: 0.25 NEAR to the allowlisted merchant',
      input: { to: ACCOUNTS.shop, amountNEAR: '0.25', memo: 'demo-invoice-001' },
      expect: 'ALLOW + tx',
    },
    {
      id: '2_over_per_tx_cap',
      title: 'Over the per-transaction cap: 0.75 NEAR (cap is 0.5)',
      input: { to: ACCOUNTS.shop, amountNEAR: '0.75', memo: 'too-big' },
      expect: 'REJECT (policy), no tx',
    },
    {
      id: '3_scam_lookalike',
      title: `Scam lookalike: 0.10 NEAR to ${ACCOUNTS.lookalike} (note the extra "s")`,
      input: { to: ACCOUNTS.lookalike, amountNEAR: '0.10', memo: 'urgent-payment' },
      expect: 'REJECT (policy), no tx',
    },
  ];

  const results = [];
  for (const s of scenarios) {
    console.log(`\n=== Scenario ${s.id}: ${s.title}`);
    console.log(`    proposal: pay ${s.input.amountNEAR} NEAR -> ${s.input.to}`);
    const r = await proposePayment(s.input);
    if (r.policy.decision === 'REJECT') {
      console.log('    POLICY: REJECT — no transaction was created');
      for (const reason of r.policy.reasons) console.log(`      - ${reason}`);
    } else {
      console.log('    POLICY: ALLOW');
      console.log(`    SENT tx: ${r.broadcast.txHash}`);
      console.log(`    explorer: ${r.broadcast.explorerUrl}`);
    }
    results.push({ scenario: s.id, title: s.title, expect: s.expect, input: s.input, result: r });
  }

  const stats = await viewCall(ACCOUNTS.vault, 'get_stats', {});
  console.log('\n=== Vault stats after demo:', JSON.stringify(stats));

  const ev = { generatedAt: new Date().toISOString(), network: 'testnet', results, vaultStatsAfter: stats };
  const outPath = path.join(ROOT, 'evidence', 'demo.json');
  fs.writeFileSync(outPath, JSON.stringify(ev, null, 2));
  console.log('evidence written:', outPath);
})().catch((e) => {
  console.error('ERR', (e.message || String(e)).slice(0, 400));
  process.exit(1);
});
