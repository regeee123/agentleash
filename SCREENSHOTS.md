# Demo post assets — AgentLeash

Per HACKATHON.md Q-012, a local/CLI demo needs a **video** in the X post
(screenshots alone are "not enough when judges cannot open the demo").
Record a short terminal video (60–90 s) covering, in order:

1. `node scripts/check-balances.js` — the five testnet accounts.
2. Explorer page for `agent.agentleash2026.testnet` showing the function-call
   key: receiver = vault, methods = [pay], allowance 1 NEAR.
3. `node scripts/demo.js` full run — the three scenarios:
   - ✅ scenario 1: ALLOW + tx hash (open the explorer link, show the shop
     received 0.25 NEAR from the vault),
   - ⛔ scenario 2: REJECT — per-transaction cap,
   - ⛔ scenario 3: REJECT — scam lookalike.
4. `node scripts/prove-leash.js` output — the three chain rejection errors
   (ReceiverMismatch / MethodNameMismatch / NotEnoughAllowance) and the
   final vault stats (exactly 1 payment landed).

Screenshots (backup / thread follow-ups) — capture these terminal outputs:
- [ ] `node scripts/prove-leash.js` — lines A (key permission on chain) + B (allowed pay tx)
- [ ] `node scripts/prove-leash.js` — lines C + D + E (the three protocol rejections)
- [ ] `node scripts/demo.js` — scenario 1 (ALLOW + explorer URL)
- [ ] `node scripts/demo.js` — scenarios 2 + 3 (both POLICY REJECT lines)
- [ ] Explorer: tx `GBbA4mYF1FbpU6EkrjfgXG9BJED463kxDASK1tp8aAr` (leash proof payment)
- [ ] Explorer: tx `HitYg8KeHDk2c1sMQ2reXFYbUPkKAiEJasQnxshF1ZWA` (demo payment)
