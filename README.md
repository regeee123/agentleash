# AgentLeash — a policy-guarded wallet for AI agents

**Give AI money without giving it the keys to everything.**

An AI agent that can pay needs a wallet — but a normal wallet key lets it
(or anything that compromises it) send everything, anywhere, instantly.
AgentLeash puts the agent on a three-layer leash:

1. **Policy engine (off-chain).** Every proposed payment is screened before
   anything is signed: per-transaction cap (0.5 NEAR), daily cap (1 NEAR,
   tracked in the agent's own spend ledger), a recipient allowlist, and
   scam-lookalike detection (a recipient one or two edits away from an
   allowlisted address is rejected as a probable scam). A rejection means
   no transaction is ever created — no gas spent, nothing on chain.
2. **Vault contract (on-chain).** Payments are made by a small Rust contract
   (`PaymentVault`) out of a capped **float** (2 NEAR in this demo), never
   from the main wallet. The contract itself enforces a hard per-payment
   cap (0.5 NEAR) and has an owner-only pause switch.
3. **Scoped function-call key (on-chain).** The agent process only holds a
   NEAR *function-call access key* that can call **one method**
   (`pay`) on **one contract** (the vault), with a small gas-only
   allowance (1 NEAR). It cannot transfer NEAR, cannot call any other
   contract or method, and cannot attach a deposit — NEAR's protocol
   enforces all of this, not our code.

If the agent is prompt-injected, buggy, or fully compromised, the worst
case is bounded: at most the vault float, in ≤0.5 NEAR chunks, through the
vault — and the owner can pause the vault or delete the key at any time.

Built at **NEAR HACKATHON** (tracks: AI Security & Defense, Agent Economy).
Testnet only; no real funds are involved anywhere in this repository.

> Sibling entry (same builder, independent project, disclosed per the
> hackathon rules): **RitualCoin** — a memecoin with an on-chain ritual
> mechanic (NEAR HACKATHON, Memecoins With Mechanics track).

## Why a float? A NEAR protocol finding

The obvious design — agent attaches a deposit to each `pay` call through
its function-call key — is **impossible on NEAR**: function-call access
keys cannot attach deposits. We proved this on testnet; the chain rejects
such a call with `AccessKeyDepositWithFunctionCallActionError`
("Deposit is not allowed with function call"). See
`evidence/deposit-restriction-discovery.json`. The float pattern is the
standard answer: fund a small escrow contract once, let the leashed key
direct payments out of the float.

## Live deployment (NEAR testnet)

| Thing | Account |
| --- | --- |
| Owner ("the human") | `agentleash2026.testnet` |
| Agent account | `agent.agentleash2026.testnet` |
| PaymentVault contract | `vault.agentleash2026.testnet` |
| Allowlisted merchant | `shop.agentleash2026.testnet` |
| Scam lookalike (demo) | `shops.agentleash2026.testnet` |

The agent's leash key (public):
`ed25519:5ZZqCk2mygvpJRVi1pjR1kvLmHy7iZwPqAW7DzxgxP8D` — on-chain permission:
receiver `vault.agentleash2026.testnet`, methods `["pay"]`, allowance 1 NEAR.
Verify it yourself:
`https://explorer.testnet.near.org/accounts/agent.agentleash2026.testnet`

## Try it — do X, see Y

Prerequisites: Node.js 20+, `npm install` in this directory. Testnet RPC is
occasionally slow; scripts retry.

The demo accounts and keys in `.keys/` are **testnet throwaways** created
for this hackathon (the folder is gitignored; a fresh clone must run the
setup steps below or provide its own testnet accounts).

1. **Check the deployment.**
   `node scripts/check-balances.js`
   → See the five accounts with their NEAR balances (owner ≈10 NEAR at start).
2. **See the leash proofs.**
   `node scripts/prove-leash.js`
   → Runs seven on-chain checks and writes `evidence/leash-proof.json`:
   the key's permission as stored on-chain; an allowed 0.1 NEAR payment
   succeeding (shop's balance +0.1, key allowance down by ~0.0002 NEAR of
   gas only); a call to a different contract rejected with
   `AccessKeyReceiverMismatchActionError`; a call to the forbidden method
   `set_paused` rejected with `AccessKeyMethodNameMismatchActionError`;
   a micro-allowance key rejected with
   `AccessKeyNotEnoughAllowanceActionError`; a 0.75 NEAR payment rejected
   by the vault's 0.5 NEAR contract cap; final vault stats showing exactly
   one payment landed.
   Reference run: payment tx
   `GBbA4mYF1FbpU6EkrjfgXG9BJED463kxDASK1tp8aAr`.
3. **Run the agent demo.**
   `node scripts/demo.js`
   → Three proposals through the real agent CLI stack:
   (1) 0.25 NEAR to the allowlisted merchant → `POLICY: ALLOW`, transaction
   broadcast (reference tx
   `HitYg8KeHDk2c1sMQ2reXFYbUPkKAiEJasQnxshF1ZWA`);
   (2) 0.75 NEAR → `POLICY: REJECT` (per-transaction cap), no transaction;
   (3) 0.10 NEAR to `shops.…` → `POLICY: REJECT` (scam lookalike), no
   transaction. Full output is saved to `evidence/demo.json`.
4. **Use the agent yourself.**
   `node src/agent.js propose --to shop.agentleash2026.testnet --amount 0.1 --memo "coffee"`
   → `POLICY: ALLOW`, then `SENT tx …` with an explorer link.
   Try `--amount 0.9` or the lookalike address and watch it refuse (exit
   code 2, nothing signed).
5. **Owner kill switches (owner key required).**
   Pause the vault: call `set_paused { "paused": true }` on
   `vault.agentleash2026.testnet` — subsequent `pay` calls fail.
   Or delete the agent's leash key — the agent can no longer sign at all,
   while its full-access key never left the owner's hands.

## How it works

```
proposal ──► policy engine ──REJECT──► (nothing is signed, nothing on chain)
                │ ALLOW
                ▼
   agent signs with scoped key ──► PaymentVault.pay(recipient, amount)
                                        │  contract asserts amount ≤ cap,
                                        │  vault not paused, float sufficient
                                        ▼
                                   recipient is paid from the vault float
```

- `contract-rs/payment-vault/` — the vault (Rust, near-sdk 5). An earlier
  near-sdk-js build worked but produced a 531 KB wasm (≈5.3 NEAR of deploy
  storage); the Rust build is 87 KB. The JS source is kept in `contract/src/`.
- `src/policy.js` — the policy engine (caps, allowlist, lookalike detection,
  daily spend ledger in `state/spend-ledger.json`).
- `src/agent-core.js` / `src/agent.js` — propose → check → sign (scoped key
  only) → broadcast.
- `scripts/` — account setup, deployment, key issuance, proofs, demo.
- `evidence/` — the recorded outputs of the reference runs.

## Security model in one paragraph

Trust is minimized layer by layer. The policy engine is *advisory*: if it
is bypassed, the vault still caps each payment at 0.5 NEAR and can only
spend its float; if the vault had a bug, the key still cannot make it do
anything except call `pay`; and the agent's key can never move the main
wallet's funds, deploy code, manage keys, or stake. Deleting one key or
pausing one contract fully stops the agent. This is what NEAR's function
call keys + sub-accounts are for — AgentLeash packages them into a wallet
an AI can actually be trusted with.

## Built with

- near-sdk 5 (Rust) for the contract; near-api-js 7 for the agent/scripts;
  near-cli-rs for faucet account creation. All standard NEAR tooling.
- No templates for the agent/policy code — written for this hackathon
  (window per the rules: code since the 2026-10-19 announcement counts).

## License

MIT — see LICENSE.
