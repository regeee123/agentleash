//! PaymentVault v2 — float pattern.
//!
//! Why: NEAR function-call access keys cannot attach a deposit (the chain
//! rejects it with AccessKeyDepositWithFunctionCallActionError — proven on
//! testnet, see the AgentLeash evidence files). So the vault holds a small
//! float of the owner's money, and the agent's leash key calls `pay` with
//! ZERO deposit; the vault pays the recipient out of its float.
//!
//! On-chain guardrails inside this contract:
//! - hard per-payment cap (`max_per_payment_yocto`, set at init)
//! - owner-only pause switch (`set_paused`) — the agent's key cannot call it
//! - payments can never touch more than the float: the contract's balance is
//!   all it can send, and a storage reserve is always kept back.
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near, AccountId, PanicOnDefault, Promise};

/// Always keep at least this much in the contract account (code + state storage).
const STORAGE_RESERVE_YOCTO: u128 = 1_000_000_000_000_000_000_000_000; // 1 NEAR

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct PaymentVault {
    owner: AccountId,
    paused: bool,
    payment_count: u64,
    total_paid_yocto: u128,
    max_per_payment_yocto: u128,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub struct Stats {
    pub owner: AccountId,
    pub paused: bool,
    pub payment_count: u64,
    pub total_paid_yocto: U128,
    pub max_per_payment_yocto: U128,
    pub contract_balance_yocto: U128,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub struct Receipt {
    pub recipient: AccountId,
    pub amount_yocto: U128,
    pub payment_count: u64,
}

#[near]
impl PaymentVault {
    #[init]
    pub fn init(owner: AccountId, max_per_payment_yocto: U128) -> Self {
        Self {
            owner,
            paused: false,
            payment_count: 0,
            total_paid_yocto: 0,
            max_per_payment_yocto: max_per_payment_yocto.0,
        }
    }

    /// Pays `amount_yocto` from the vault float to `recipient`.
    /// Called by the agent through its scoped function-call key (no deposit).
    pub fn pay(&mut self, recipient: AccountId, amount_yocto: U128, memo: Option<String>) -> Receipt {
        assert!(!self.paused, "vault is paused by owner");
        let amount = amount_yocto.0;
        assert!(amount > 0, "amount must be positive");
        assert!(
            amount <= self.max_per_payment_yocto,
            "amount exceeds the vault per-payment cap"
        );
        let balance = env::account_balance().as_yoctonear();
        assert!(
            balance >= amount + STORAGE_RESERVE_YOCTO,
            "vault float too low for this payment"
        );
        let payer = env::predecessor_account_id();
        Promise::new(recipient.clone()).transfer(near_sdk::NearToken::from_yoctonear(amount));
        self.payment_count += 1;
        self.total_paid_yocto += amount;
        env::log_str(&format!(
            "AGENTLEASH_PAYMENT payer={} recipient={} amount_yocto={} memo={}",
            payer,
            recipient,
            amount,
            memo.unwrap_or_default()
        ));
        Receipt {
            recipient,
            amount_yocto: U128(amount),
            payment_count: self.payment_count,
        }
    }

    /// Owner-only kill switch. The agent's leash key is NOT allowed to call this.
    pub fn set_paused(&mut self, paused: bool) -> bool {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "only the vault owner can pause"
        );
        self.paused = paused;
        env::log_str(&format!("AGENTLEASH_PAUSED paused={}", paused));
        paused
    }

    pub fn get_stats(&self) -> Stats {
        Stats {
            owner: self.owner.clone(),
            paused: self.paused,
            payment_count: self.payment_count,
            total_paid_yocto: U128(self.total_paid_yocto),
            max_per_payment_yocto: U128(self.max_per_payment_yocto),
            contract_balance_yocto: U128(env::account_balance().as_yoctonear()),
        }
    }
}
