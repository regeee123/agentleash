'use strict';
// AgentLeash policy engine (layer 1, off-chain).
//
// Every payment the agent wants to make is screened BEFORE anything is
// signed: per-transaction cap, daily cap (from the agent's own spend
// ledger), recipient allowlist, and scam-lookalike detection. A rejection
// here means no transaction is ever created — no gas spent, nothing on
// chain. The on-chain layers (vault cap, scoped key) do not depend on this
// engine: they hold even if this code is bypassed or buggy.
const fs = require('fs');
const path = require('path');
const { near, ROOT } = require('./near');

const POLICY_PATH = path.join(ROOT, 'policy.json');
const LEDGER_PATH = path.join(ROOT, 'state', 'spend-ledger.json');

function loadPolicy() {
  return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
}

function loadLedger() {
  try {
    return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  } catch {
    return { entries: [] };
  }
}

function recordSpend(entry) {
  const ledger = loadLedger();
  ledger.entries.push(entry);
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

function spentTodayYocto(ledger, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return ledger.entries
    .filter((e) => e.ts.slice(0, 10) === day)
    .reduce((sum, e) => sum + BigInt(e.amountYocto), 0n);
}

// Classic Levenshtein distance (account ids are short — this is cheap).
function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

// Normalizes an account id for lookalike comparison: lowercase, and folds
// common visual substitutions (0->o, 1->l) so "sh0p..." still matches "shop...".
function normalize(id) {
  return id.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l');
}

function evaluate({ recipient, amountYocto }, policy = loadPolicy(), ledger = loadLedger()) {
  const reasons = [];
  const amount = BigInt(amountYocto);
  const perTxCap = near.nearToYocto(policy.perTxCapNEAR);
  const dailyCap = near.nearToYocto(policy.dailyCapNEAR);

  if (amount <= 0n) reasons.push('amount must be positive');

  if (amount > perTxCap) {
    reasons.push(`amount ${near.yoctoToNear(amount)} NEAR exceeds per-transaction cap of ${policy.perTxCapNEAR} NEAR`);
  }

  const allowlist = policy.allowlist.map((x) => x.toLowerCase());
  const recip = String(recipient || '').toLowerCase();
  if (!allowlist.includes(recip)) {
    const lookalikeOf = policy.allowlist.find(
      (allowed) => editDistance(normalize(recip), normalize(allowed.toLowerCase())) <= policy.lookalikeMaxDistance
    );
    if (lookalikeOf) {
      reasons.push(
        `recipient ${recipient} looks like a SCAM LOOKALIKE of allowlisted ${lookalikeOf} (edit distance <= ${policy.lookalikeMaxDistance})`
      );
    } else {
      reasons.push(`recipient ${recipient} is not on the allowlist`);
    }
  }

  const spent = spentTodayYocto(ledger);
  if (spent + amount > dailyCap) {
    reasons.push(
      `daily cap exceeded: already spent ${near.yoctoToNear(spent)} NEAR today, cap is ${policy.dailyCapNEAR} NEAR`
    );
  }

  return {
    decision: reasons.length === 0 ? 'ALLOW' : 'REJECT',
    reasons,
    spentTodayYocto: spent.toString(),
  };
}

module.exports = { evaluate, loadPolicy, loadLedger, recordSpend, editDistance, normalize };
