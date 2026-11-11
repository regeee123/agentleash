# AgentLeash — PROGRESS

Track: AI Security & Defense (`security`) + Agent Economy (`agents`). Testnet only.
Parent account: `agentleash2026.testnet` (faucet-funded, 10 test NEAR, tx 6PH61yMrbWvxjTdarNsfYtwahWJJAUvRsKkL4u2jXmnJ).

Accounts (subaccounts of the parent):
- agent.agentleash2026.testnet — the AI agent; holds funds; gets the scoped function-call key
- vault.agentleash2026.testnet — PaymentVault contract account
- shop.agentleash2026.testnet — allowlisted recipient ("the merchant")
- shops.agentleash2026.testnet — scam lookalike (NOT allowlisted) for demo scenario 3

Keys: `.keys/*.json`, chmod 600, NEVER printed/committed. `.keys/` is gitignored.

## Checklist
- [x] 1a. Toolchain: node v24, near-api-js 7.5.3, near-cli-rs 0.31.1
- [x] 1b. Parent testnet account created + funded via faucet (10 NEAR)
- [x] 1c. Contract toolchain: near-sdk-js wasm was 531 KB (~5.3 NEAR storage — too big);
      PIVOTED to Rust near-sdk 5 → payment_vault.wasm 86.9 KB. (JS source kept in contract/src/.)
- [x] 1d. Subaccounts created + funded (scripts/setup-accounts.js) — agent 4, vault 1.5, shop 0.05, shops 0.05 NEAR
- [x] 2. PaymentVault (Rust) deployed to vault.agentleash2026.testnet,
      code_hash DpdinNbXkmcjb15UTp4jVkqbAUF2hqm9ZHu1jvHeXVL7, init done (owner=agentleash2026.testnet)
- [x] 3. Leash proofs on-chain (evidence/leash-proof.json): A scope ✓, B allowed pay ✓
      (tx GBbA4mYF1FbpU6EkrjfgXG9BJED463kxDASK1tp8aAr, shop +0.1 NEAR, key allowance
      burned only 0.000207 NEAR of gas), C ReceiverMismatch ✓, D MethodNameMismatch ✓,
      E NotEnoughAllowance (micro leash) ✓, F contract cap rejects 0.75 NEAR ✓,
      G stats: exactly 1 payment landed ✓
- [x] 4. Policy engine + agent CLI; 3 demo scenarios end-to-end (evidence/demo.json):
      S1 legit 0.25 NEAR → ALLOW + tx HitYg8KeHDk2c1sMQ2reXFYbUPkKAiEJasQnxshF1ZWA;
      S2 0.75 NEAR → REJECT per-tx cap (no tx); S3 lookalike shops.* → REJECT scam
      lookalike (no tx). Vault after demo: 2 payments, 0.35 NEAR total paid.
- [x] 5. README.md (do-X-see-Y), SCREENSHOTS.md, LICENSE

## KEY PROTOCOL FINDING (2026-11-11, proven on testnet)
- Function-call access keys CANNOT attach a deposit: pay with 0.1 NEAR deposit was
  rejected with `AccessKeyDepositWithFunctionCallActionError` ("Deposit is not allowed
  with function call"). Evidence: evidence/deposit-restriction-discovery.json (checks B–E).
- => Architecture v2 = FLOAT pattern: vault holds a small float; leash key calls
  `pay({recipient, amount, memo})` with ZERO deposit; the vault pays from its float.
  Defense in depth: L1 policy engine (off-chain allowlist/caps) · L2 contract hard
  per-payment cap 0.5 NEAR + pause + float isolation · L3 scoped key (only vault.pay,
  gas-only allowance, no deposits/transfers/other contracts — C/D/E rejections all
  produced the exact protocol errors: ReceiverMismatch, MethodNameMismatch,
  NotEnoughAllowance).

## Notes / gotchas found
- near-api-js v7: no `connect`/keyStores; use Account + JsonRpcProvider + KeyPairSigner.
  FailoverRpcProvider takes JsonRpcProvider instances, not {url} objects.
- rpc.testnet.near.org is reachable but occasionally slow from this VM;
  failover list: rpc.testnet.near.org, near-testnet.drpc.org, archival-rpc.testnet.near.org.
- v7 Account.callFunction = state-changing; provider.callFunction = view.
- addFunctionCallAccessKey allowance is in yoctoNEAR.
