import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A real Postgres (PGlite) with the pieces of Supabase the migrations rely on, so row-level security,
 * triggers and constraints can be tested for real rather than mocked. It is NOT a Supabase project:
 * it knows nothing about production data or settings.
 *
 * `doctors`, `doctor_visits` and `daily_challenges` used to be hand-written stand-ins here because production
 * had them without a migration. `003a_production_baseline_gap.sql` now creates them exactly as production has
 * them (checked by schemaBaseline.test.ts), so a database built here is built only from the files.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), 'anon')::text $$;
  -- pgcrypto stand-in (PGlite has no extension): random bytes are only used for invite codes here.
  create function public.gen_random_bytes(n int) returns bytea language sql volatile as $$ select decode(substr(md5(random()::text) || md5(random()::text) || md5(random()::text) || md5(random()::text), 1, n * 2), 'hex') $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
`

/**
 * Production as of 2026-11-06, for the parts that differ from the migration files (read from production's
 * pg_policies and pg_proc; see docs/security/production-readiness-audit.md). Applied only when the hardening
 * migration is skipped, to show what production looks like today. The hardening migration itself reproduces
 * these differences where they are safe, so a database built from the files plus that migration needs no patch.
 */
const PRODUCTION_TODAY = `
  create function public.auth_company_id() returns uuid language sql stable security definer set search_path = public, pg_temp
    as 'select company_id from public.profiles where id = auth.uid()';
  create function public.auth_is_manager() returns boolean language sql stable security definer set search_path = public, pg_temp
    as 'select exists(select 1 from public.profiles where id = auth.uid() and role = ''manager'')';
  drop policy "manager profiles read" on public.profiles;
  create policy "manager profiles read" on public.profiles for select using (public.auth_is_manager() and company_id = public.auth_company_id());
  drop policy "manager sessions read" on public.sessions;
  create policy "manager sessions read" on public.sessions for select
    using (rep_id in (select p.id from public.profiles p where p.company_id = public.auth_company_id()));
  drop policy "manager insert company" on public.companies;
  create policy "own roleplay sessions update" on public.roleplay_sessions for update using (rep_id = auth.uid())
    with check (rep_id = auth.uid()
      and (doctor_id is null or doctor_id in (select id from public.doctors where rep_id = auth.uid()))
      and (colleague_id is null or colleague_id in (select id from public.colleagues where rep_id = auth.uid())));
`

export interface MigrationResult { file: string; ok: boolean; error?: string }

export interface TestDb {
  db: PGlite
  migrations: MigrationResult[]
  /** Run as the service role (bypasses RLS), like the server's admin client. */
  asService<T = Record<string, unknown>>(sql: string): Promise<T[]>
  /** Run as a signed-in user. Every statement is its own transaction with the user's claims, rolled back unless `commit`. */
  asUser<T = Record<string, unknown>>(userId: string, sql: string, opts?: { commit?: boolean }): Promise<T[]>
  /** Run as an anonymous visitor. */
  asAnon<T = Record<string, unknown>>(sql: string): Promise<T[]>
}

async function inRole<T>(db: PGlite, role: string, claims: Record<string, unknown>, sql: string, commit: boolean): Promise<T[]> {
  await db.exec('begin')
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claim.role', $3, true)`,
      [JSON.stringify(claims), String(claims.sub ?? ''), String(claims.role ?? '')])
    await db.exec(`set local role ${role}`)
    const res = await db.query<T>(sql)
    await db.exec(commit ? 'commit' : 'rollback')
    return res.rows
  } catch (e) {
    await db.exec('rollback')
    throw e
  }
}

export async function createTestDb(opts: { skip?: string[] } = {}): Promise<TestDb> {
  const db = new PGlite()
  await db.exec(SUPABASE_STUBS)
  const migrations: MigrationResult[] = []
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
  for (const file of files) {
    if (opts.skip?.includes(file)) { migrations.push({ file, ok: true, error: 'skipped on purpose' }); continue }
    // PGlite has no pgcrypto; gen_random_uuid() is built in, so the extension line is the only thing dropped.
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/create\s+extension\s+if\s+not\s+exists\s+"?pgcrypto"?[^;]*;/gi, '')
    try { await db.exec(sql); migrations.push({ file, ok: true }) }
    catch (e) { migrations.push({ file, ok: false, error: String((e as Error).message).split('\n')[0] }) }
  }
  // Without the hardening migration the files alone are not production, so apply what production has today.
  if (opts.skip?.some(f => f.includes('security_hardening'))) await db.exec(PRODUCTION_TODAY)
  return {
    db, migrations,
    asService: (sql) => inRole(db, 'service_role', { role: 'service_role' }, sql, true),
    asUser: (userId, sql, opts) => inRole(db, 'authenticated', { sub: userId, role: 'authenticated' }, sql, opts?.commit === true),
    asAnon: (sql) => inRole(db, 'anon', { role: 'anon' }, sql, false),
  }
}
