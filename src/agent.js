'use strict';
// AgentLeash CLI.
//   node src/agent.js propose --to shop.agentleash2026.testnet --amount 0.25 --memo "invoice 42"
//   node src/agent.js propose --to shops.agentleash2026.testnet --amount 0.1   (watch it get rejected)
// Exit code 0 = payment broadcast (or dry-run allowed), 2 = policy rejected.
const { proposePayment } = require('./agent-core');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
    else out._.push(a);
  }
  return out;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args._[0] !== 'propose' || !args.to || !args.amount) {
    console.log('Usage: node src/agent.js propose --to <account> --amount <NEAR> [--memo <text>] [--dry-run]');
    process.exit(1);
  }
  console.log(`PROPOSAL  pay ${args.amount} NEAR -> ${args.to}${args.memo ? ` (memo: ${args.memo})` : ''}`);
  const dryRun = process.argv.includes('--dry-run');
  const result = await proposePayment({ to: args.to, amountNEAR: args.amount, memo: args.memo || '', dryRun });
  if (result.policy.decision === 'REJECT') {
    console.log('POLICY    REJECT — no transaction was created');
    for (const r of result.policy.reasons) console.log(`          - ${r}`);
    process.exit(2);
  }
  console.log('POLICY    ALLOW');
  if (dryRun) {
    console.log('DRY-RUN   not broadcasting');
    return;
  }
  if (result.broadcast) {
    console.log(`SENT      tx ${result.broadcast.txHash}`);
    console.log(`EXPLORER  ${result.broadcast.explorerUrl}`);
  }
})().catch((e) => {
  console.error('ERROR', (e.message || String(e)).slice(0, 300));
  process.exit(1);
});
