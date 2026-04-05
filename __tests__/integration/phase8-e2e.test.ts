import { describe, expect, it } from '@jest/globals';
import {
  buildPhase8CashOutstandingScenario,
  buildPhase8ContactScenario,
  buildPhase8DuplicateWebhookScenario,
  buildPhase8IdentityWithdrawalScenario,
  buildPhase8NegotiationScenario,
  buildPhase8TrackingScenario,
  buildPhase8WalletDeliveryScenario,
} from '@/lib/integration-phase-helpers';

describe('Phase 8 - Full End-to-End Scenario Pack', () => {
  it('customer funds wallet, creates wallet-paid order, rider accepts, delivery completes', () => {
    const scenario = buildPhase8WalletDeliveryScenario();

    expect(scenario.payment.amount).toBe(5000);
    expect(scenario.order.payment_method).toBe('wallet');
    expect(scenario.order.delivery_code_verified).toBe(true);
    expect(scenario.payout.gross).toBe(3200);
    expect(scenario.payout.net + scenario.payout.commission).toBe(3200);
  });

  it('customer creates cash-paid order, rider completes, outstanding balance is recorded', () => {
    const scenario = buildPhase8CashOutstandingScenario();

    expect(scenario.payment_method).toBe('cash');
    expect(scenario.outstanding_balance).toBe(scenario.final_price);
  });

  it('rider uploads required docs, updates bank account, submits withdrawal request', () => {
    const scenario = buildPhase8IdentityWithdrawalScenario();

    expect(scenario.documentPath).toContain('rider-docs/profile-rider-1/documents/drivers_license/');
    expect(scenario.bankMutation.action).toBe('insert');
    expect(scenario.withdrawal.ok).toBe(true);
    expect(scenario.withdrawal.payout).toBe(1400);
  });

  it('negotiation reaches final round and blocks further counters correctly', () => {
    const scenario = buildPhase8NegotiationScenario();

    expect(scenario.newBid).toBeNull();
    expect(scenario.error).toContain('Maximum 3 negotiation rounds');
  });

  it('stale rider location shows degraded tracking state and recovers when fresh updates return', () => {
    const scenario = buildPhase8TrackingScenario();

    expect(scenario.stale.stale).toBe(true);
    expect(scenario.fresh.stale).toBe(false);
  });

  it('matched customer/rider can contact each other, unrelated users cannot', () => {
    const scenario = buildPhase8ContactScenario();

    expect(scenario.matchedCustomerView).toEqual({
      full_name: 'Rider One',
      phone: '+2348011111111',
    });
    expect(scenario.unrelatedView).toBeNull();
  });

  it('duplicate webhook replay after successful funding does not alter wallet balance', () => {
    const scenario = buildPhase8DuplicateWebhookScenario();

    expect(scenario.firstCreditAccepted).toBe(true);
    expect(scenario.secondCreditAccepted).toBe(false);
    expect(scenario.duplicateReference).toBe('FUND-e2e-1');
  });
});
