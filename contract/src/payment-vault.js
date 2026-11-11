// PaymentVault — the one contract an AgentLeash agent is allowed to pay through.
//
// The agent's function-call access key is scoped to THIS contract's `pay`
// method only. `set_paused` exists as the owner's kill switch — and as proof
// surface: the agent's scoped key cannot call it (the chain rejects the call
// before the contract code ever runs).
import { NearBindgen, near, call, view, initialize } from 'near-sdk-js';

@NearBindgen({})
class PaymentVault {
  owner = '';
  paused = false;
  paymentCount = 0;
  totalPaidYocto = '0';

  @initialize({})
  init({ owner }) {
    this.owner = owner;
  }

  // Payable: the attached deposit is forwarded to `recipient` in the same tx.
  @call({ payableFunction: true })
  pay({ recipient, memo }) {
    if (this.paused) {
      throw new Error('vault is paused by owner');
    }
    const amount = near.attachedDeposit();
    if (amount === 0n) {
      throw new Error('pay requires an attached deposit');
    }
    if (typeof recipient !== 'string' || recipient.length < 2 || recipient.length > 64) {
      throw new Error('invalid recipient');
    }
    const promise = near.promiseBatchCreate(recipient);
    near.promiseBatchActionTransfer(promise, amount);
    this.paymentCount += 1;
    this.totalPaidYocto = (BigInt(this.totalPaidYocto) + amount).toString();
    near.log(
      `AGENTLEASH_PAYMENT payer=${near.predecessorAccountId()} recipient=${recipient} amount_yocto=${amount.toString()} memo=${memo || ''}`
    );
    return { recipient, amountYocto: amount.toString(), paymentCount: this.paymentCount };
  }

  // Owner-only kill switch. The agent's leash key is NOT allowed to call this.
  @call({})
  set_paused({ paused }) {
    if (near.predecessorAccountId() !== this.owner) {
      throw new Error('only the vault owner can pause');
    }
    this.paused = !!paused;
    near.log(`AGENTLEASH_PAUSED paused=${this.paused}`);
    return { paused: this.paused };
  }

  @view({})
  get_stats() {
    return {
      owner: this.owner,
      paused: this.paused,
      paymentCount: this.paymentCount,
      totalPaidYocto: this.totalPaidYocto,
    };
  }
}
