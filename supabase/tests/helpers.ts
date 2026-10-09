import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const supabaseDir = join(here, '..');

/** Minimal stand-ins for the Supabase-managed schemas/roles so our migrations run unmodified. */
const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
  name text not null, owner uuid
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select string_to_array(name, '/') $$;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant select on storage.objects to authenticated;
grant insert, update, delete on storage.objects to authenticated;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
-- Supabase grants everything on new public tables to the API roles by default; our migrations must revoke it.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export type Db = PGlite;

export async function createDb(options: { seed?: boolean } = {}): Promise<Db> {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(SUPABASE_STUBS);
  const dir = join(supabaseDir, 'migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(dir, file), 'utf8'));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  if (options.seed !== false) {
    await db.exec(readFileSync(join(supabaseDir, 'seed.sql'), 'utf8'));
  }
  // Seed runs as superuser; make sure the session ends up there.
  await db.exec('reset role');
  return db;
}

export async function createUser(db: Db, email: string, fullName = 'Test User'): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [email, JSON.stringify({ full_name: fullName })],
  );
  return res.rows[0]!.id;
}

export async function grantRole(db: Db, userId: string, roleKey: string, branchSlug?: string) {
  await db.query(
    `insert into public.user_roles (user_id, role_id, branch_id)
     values ($1, (select id from public.roles where key = $2),
             (select id from public.branches where slug = $3))`,
    [userId, roleKey, branchSlug ?? null],
  );
}

type Actor = 'anon' | 'service' | { userId: string };

/** Run a callback with the Postgres role and JWT subject of a Supabase client, then restore superuser. */
export async function as<T>(db: Db, actor: Actor, fn: () => Promise<T>): Promise<T> {
  const role = actor === 'anon' ? 'anon' : actor === 'service' ? 'service_role' : 'authenticated';
  const sub = typeof actor === 'object' ? actor.userId : '';
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub]);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

/** Resolve a promise that is expected to fail and return its message. */
export async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('Expected the operation to fail, but it succeeded');
}

/** A future date (YYYY-MM-DD, Lagos wall clock) far enough ahead to satisfy booking notice rules. */
export function futureDate(daysAhead = 3): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(d);
}

export const ids = {
  swedish: '00000000-0000-0000-0000-00000000b001',
  hydrafacial: '00000000-0000-0000-0000-00000000b002',
  staffA: '00000000-0000-0000-0000-00000000a001',
  staffB: '00000000-0000-0000-0000-00000000a002',
  serumVariant: '00000000-0000-0000-0000-00000000e001',
  serum: '00000000-0000-0000-0000-00000000d001',
};

export async function branchId(db: Db, slug: string): Promise<string> {
  const r = await db.query<{ id: string }>(`select id from public.branches where slug = $1`, [slug]);
  return r.rows[0]!.id;
}
