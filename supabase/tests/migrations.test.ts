import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLES } from '@infinity/core';
import { createDb, type Db } from './helpers';

let db: Db;
beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

describe('schema', () => {
  it('applies every migration and the seed', async () => {
    const branches = await db.query<{ slug: string }>(`select slug from public.branches order by display_order`);
    expect(branches.rows.map((r) => r.slug)).toEqual(['abuja', 'kano', 'kaduna', 'sokoto']);
  });

  it('enables RLS on every public table', async () => {
    const res = await db.query<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(res.rows).toEqual([]);
  });

  it('grants nothing to anon on sensitive tables', async () => {
    const res = await db.query<{ table_name: string }>(`
      select distinct table_name from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'
        and table_name in ('profiles','bookings','payments','orders','inventory','user_roles','audit_logs','notification_outbox')`);
    expect(res.rows).toEqual([]);
  });

  it('keeps the permission matrix in sync with @infinity/core', async () => {
    const perms = await db.query<{ key: string }>(`select key from public.permissions`);
    expect(perms.rows.map((r) => r.key).sort()).toEqual([...PERMISSIONS].sort());
    for (const role of ROLES) {
      const rows = await db.query<{ permission_key: string }>(
        `select rp.permission_key from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.key = $1`,
        [role],
      );
      const dbPerms = rows.rows.map((r) => r.permission_key).sort();
      const expected = role === 'super_admin' ? [...PERMISSIONS] : [...DEFAULT_ROLE_PERMISSIONS[role]];
      expect(dbPerms, role).toEqual(expected.sort());
    }
  });

  it('seeds the four branches with unverified hours and bookings disabled in production data', async () => {
    const res = await db.query<{ hours_verified: boolean }>(`select hours_verified from public.branches`);
    expect(res.rows.every((r) => r.hours_verified === false)).toBe(true);
  });

  it('ships membership plans unpublished', async () => {
    const res = await db.query<{ is_published: boolean }>(`select is_published from public.membership_plans`);
    expect(res.rows).toHaveLength(3);
    expect(res.rows.some((r) => r.is_published)).toBe(false);
  });
});
