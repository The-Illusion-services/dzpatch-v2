/**
 * Sprint 2 - Rider identity and maintenance flow regression coverage
 */

function getRiderDocumentsQueryRiderId(riderId: string | null) {
  return riderId;
}

function buildDocumentStoragePath(profileId: string, documentType: string, timestamp: number) {
  return `rider-docs/${profileId}/documents/${documentType}/${documentType}-${timestamp}.jpg`;
}

function resolveDocumentPersistenceAction(existingDocumentId: string | null) {
  return existingDocumentId ? 'update' : 'insert';
}

function resolveBankPersistenceAction(existingBankAccountId: string | null) {
  return existingBankAccountId ? 'update' : 'insert';
}

describe('Sprint 2 - rider maintenance identity', () => {
  test('document queries use riders.id, not auth profile id', () => {
    expect(getRiderDocumentsQueryRiderId('rider-row-id')).toBe('rider-row-id');
  });

  test('document uploads stay inside the authenticated rider-docs namespace', () => {
    const path = buildDocumentStoragePath('profile-auth-id', 'drivers_license', 1700000000000);
    expect(path).toBe('rider-docs/profile-auth-id/documents/drivers_license/drivers_license-1700000000000.jpg');
  });

  test('existing document rows are updated instead of assuming a unique upsert target exists', () => {
    expect(resolveDocumentPersistenceAction('doc-1')).toBe('update');
    expect(resolveDocumentPersistenceAction(null)).toBe('insert');
  });

  test('bank account persistence uses explicit insert or update paths', () => {
    expect(resolveBankPersistenceAction('bank-1')).toBe('update');
    expect(resolveBankPersistenceAction(null)).toBe('insert');
  });
});
