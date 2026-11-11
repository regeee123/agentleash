'use strict';
// Quick balance/state check for all project accounts via raw JSON-RPC.
const { ACCOUNTS, near } = require('../src/near');

const RPC = 'https://rpc.testnet.near.org';

async function viewAccount(id, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(RPC, {
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
      if (j.error) {
        if (JSON.stringify(j.error).includes('does not exist')) return null;
        throw new Error(JSON.stringify(j.error).slice(0, 160));
      }
      return j.result;
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

(async () => {
  for (const [name, id] of Object.entries(ACCOUNTS)) {
    try {
      const st = await viewAccount(id);
      if (!st) console.log(`${name.padEnd(10)} ${id.padEnd(38)} does not exist`);
      else
        console.log(
          `${name.padEnd(10)} ${id.padEnd(38)} amount=${near.yoctoToNear(BigInt(st.amount))} NEAR  storage=${st.storage_usage}B`
        );
    } catch (e) {
      console.log(`${name.padEnd(10)} ${id.padEnd(38)} ERROR ${e.message.slice(0, 120)}`);
    }
  }
})();
