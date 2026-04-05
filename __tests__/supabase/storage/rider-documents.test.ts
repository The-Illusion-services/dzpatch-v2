import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import {
  createSupabaseServiceClient,
  createSupabaseTestClients,
  hasSupabaseTestEnv,
  type SupabaseTestClients,
} from '../_helpers/client';
import { seedSupabaseBaseState, type SeededSupabaseUsers } from '../_helpers/seed';

const describeSupabase = hasSupabaseTestEnv() ? describe : describe.skip;

describeSupabase('Supabase Storage - Rider Documents and POD', () => {
  jest.setTimeout(90_000);

  let clients: SupabaseTestClients;
  let seeded: SeededSupabaseUsers;

  beforeAll(async () => {
    seeded = await seedSupabaseBaseState(createSupabaseServiceClient());
    clients = await createSupabaseTestClients();
  });

  it('rider can upload inside own prefix, read own file, and signed access works', async () => {
    const path = `rider-docs/${seeded.riderProfileId}/license.txt`;
    const upload = await clients.rider.storage.from('documents').upload(path, Buffer.from('hello'), {
      contentType: 'text/plain',
      upsert: true,
    });

    expect(upload.error).toBeNull();

    const download = await clients.rider.storage.from('documents').download(path);
    expect(download.error).toBeNull();

    const signed = await clients.rider.storage.from('documents').createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
    expect(signed.data?.signedUrl).toContain('/object/sign/');
  });

  it('rider cannot upload outside own prefix and path traversal attempts fail', async () => {
    const foreignPath = `rider-docs/${seeded.riderTwoProfileId}/foreign.txt`;
    const traversalPath = `rider-docs/../${seeded.riderProfileId}/escape.txt`;

    const foreignUpload = await clients.rider.storage.from('documents').upload(foreignPath, Buffer.from('x'), {
      contentType: 'text/plain',
      upsert: true,
    });
    const traversalUpload = await clients.rider.storage.from('documents').upload(traversalPath, Buffer.from('x'), {
      contentType: 'text/plain',
      upsert: true,
    });

    expect(foreignUpload.error).not.toBeNull();
    expect(traversalUpload.error).not.toBeNull();
  });

  it('another rider cannot read private docs while admin can read protected docs', async () => {
    const path = `rider-docs/${seeded.riderProfileId}/private.txt`;
    await clients.rider.storage.from('documents').upload(path, Buffer.from('private'), {
      contentType: 'text/plain',
      upsert: true,
    });

    const otherRead = await clients.riderTwo.storage.from('documents').download(path);
    const adminList = await clients.admin.storage.from('documents').list(`rider-docs/${seeded.riderProfileId}`);

    expect(otherRead.error).not.toBeNull();
    expect(adminList.error).toBeNull();
  });
});
