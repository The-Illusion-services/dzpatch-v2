import { describe, expect, it } from '@jest/globals';
import {
  buildBankAccountMutation,
  buildDefaultBankAccountQuery,
  buildDocumentStoragePath,
  buildRiderDocumentsQuery,
  buildRiderWithdrawWalletQuery,
  getDocumentUploadErrorMessage,
  getLatestDocumentByType,
  resolveDocumentPersistenceAction,
  usesInvalidProfileIdForRiderFlow,
  validateWithdrawalRequest,
} from '@/lib/integration-phase-helpers';

describe('Phase 2 - Rider Identity, Wallet, and Account Maintenance', () => {
  it('rider documents query uses riderId', () => {
    expect(buildRiderDocumentsQuery('rider-row-1')).toEqual({
      table: 'rider_documents',
      rider_id: 'rider-row-1',
    });
  });

  it('first document upload inserts correctly', () => {
    expect(resolveDocumentPersistenceAction(null)).toBe('insert');
  });

  it('re-upload updates correctly', () => {
    expect(resolveDocumentPersistenceAction('doc-1')).toBe('update');
  });

  it('latest document fetch returns expected row', () => {
    const latest = getLatestDocumentByType([
      {
        id: 'doc-old',
        rider_id: 'rider-1',
        document_type: 'drivers_license',
        status: 'pending',
        document_url: 'old.jpg',
        created_at: '2026-04-01T10:00:00.000Z',
      },
      {
        id: 'doc-new',
        rider_id: 'rider-1',
        document_type: 'drivers_license',
        status: 'approved',
        document_url: 'new.jpg',
        created_at: '2026-04-02T10:00:00.000Z',
      },
    ], 'drivers_license');

    expect(latest?.id).toBe('doc-new');
    expect(latest?.document_url).toBe('new.jpg');
  });

  it('document upload failure shows usable error', () => {
    expect(getDocumentUploadErrorMessage(new Error('boom'))).toBe('Upload failed. Please try again.');
  });

  it('document path stays under allowed storage prefix', () => {
    expect(buildDocumentStoragePath('profile-1', 'vehicle_insurance', 1700000000000))
      .toBe('rider-docs/profile-1/documents/vehicle_insurance/vehicle_insurance-1700000000000.jpg');
  });

  it('rider bank account create works with riderId', () => {
    expect(buildBankAccountMutation('rider-1', {
      bank_name: 'GTBank',
      bank_code: '058',
      account_number: '0123456789',
      account_name: 'Rider One',
    }, null)).toEqual({
      action: 'insert',
      values: {
        rider_id: 'rider-1',
        bank_name: 'GTBank',
        bank_code: '058',
        account_number: '0123456789',
        account_name: 'Rider One',
        is_default: true,
      },
    });
  });

  it('rider bank account update works with existing row id', () => {
    expect(buildBankAccountMutation('rider-1', {
      bank_name: 'GTBank',
      bank_code: '058',
      account_number: '0123456789',
      account_name: 'Rider One',
    }, 'bank-1')).toEqual({
      action: 'update',
      where: { id: 'bank-1' },
      values: {
        bank_name: 'GTBank',
        bank_code: '058',
        account_number: '0123456789',
        account_name: 'Rider One',
        is_default: true,
      },
    });
  });

  it('rider withdraw reads correct wallet', () => {
    expect(buildRiderWithdrawWalletQuery('profile-auth-1')).toEqual({
      owner_id: 'profile-auth-1',
      owner_type: 'rider',
    });
  });

  it('rider withdraw reads correct default bank', () => {
    expect(buildDefaultBankAccountQuery('rider-1')).toEqual({
      rider_id: 'rider-1',
      is_default: true,
    });
  });

  it('invalid profile.id usage in rider maintenance flows is rejected', () => {
    expect(usesInvalidProfileIdForRiderFlow({
      profileId: 'profile-1',
      riderId: 'rider-1',
      queryRiderId: 'profile-1',
    })).toBe(true);
  });

  it('withdraw request path handles missing bank gracefully', () => {
    expect(validateWithdrawalRequest({
      amount: 1000,
      balance: 5000,
      hasBankAccount: false,
    })).toEqual({
      ok: false,
      error: 'Add Bank Account',
      payout: 0,
    });
  });

  it('withdraw request handles insufficient balance correctly', () => {
    expect(validateWithdrawalRequest({
      amount: 3000,
      balance: 2000,
      hasBankAccount: true,
    })).toEqual({
      ok: false,
      error: 'Insufficient balance',
      payout: 0,
    });
  });
});
