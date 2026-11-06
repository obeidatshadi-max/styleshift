/**
 * A canonical, comparable summary of a database's StyleShift schema, so a database built from the migration files
 * can be compared with production without copying production's definitions around.
 *
 * Per table, one short hash for each of: columns (name, type, not-null, default; ordered by name so the order the
 * columns were added in does not matter), constraints, indexes, policies, triggers, plus whether row security is on.
 * The SAME query text runs on a test database and, read-only, in production's SQL editor.
 *
 * Out of scope on purpose: the Health360 tables (another app in the same project), the validation tables (not yet
 * applied to production), grants, and data. Hashes cover definitions as PostgreSQL prints them, so a different
 * PostgreSQL version can in principle print an equal definition differently; when a hash differs, look at the
 * detail before calling it drift.
 */

/** Tables left out of the comparison. */
export const EXCLUDED_TABLE_PATTERN = `(c.relname like 'health360%' or c.relname like 'validation%' or c.relname in ('human_ratings', 'human_rating_items', 'rating_adjudications', 'claim_adjudications'))`

const colExpr = `select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), ''), ',' order by a.attname) from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped`
const conExpr = `select string_agg(k.conname || ':' || pg_get_constraintdef(k.oid), ',' order by k.conname) from pg_constraint k where k.conrelid = t.oid`
const idxExpr = `select string_agg(x.indexname || ':' || x.indexdef, ',' order by x.indexname) from pg_indexes x where x.schemaname = 'public' and x.tablename = t.relname`
const polExpr = `select string_agg(p.policyname || ':' || p.cmd || ':' || p.roles::text || ':' || coalesce(p.qual, '') || ':' || coalesce(p.with_check, ''), ',' order by p.policyname) from pg_policies p where p.schemaname = 'public' and p.tablename = t.relname`
const trgExpr = `select string_agg(g.tgname || ':' || pg_get_triggerdef(g.oid), ',' order by g.tgname) from pg_trigger g where g.tgrelid = t.oid and not g.tgisinternal`
const h = (expr: string) => `left(md5(coalesce((${expr}), '')), 8)`

/** One row: every table as `name|rls=..|c:..|k:..|i:..|p:..|t:..`, joined with ' ; '. Safe to paste into the SQL editor. */
export const TABLE_FINGERPRINT_SQL =
  `with t as (select c.oid, c.relname, c.relrowsecurity from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not ${EXCLUDED_TABLE_PATTERN}) ` +
  `select string_agg(t.relname || '|rls=' || t.relrowsecurity::text || '|c:' || ${h(colExpr)} || '|k:' || ${h(conExpr)} || '|i:' || ${h(idxExpr)} || '|p:' || ${h(polExpr)} || '|t:' || ${h(trgExpr)}, ' ; ' order by t.relname) as fp from t`

/**
 * Functions in `public`: name, arguments, security definer, and one hash of the body with whitespace collapsed
 * (so line endings and indentation in the migration file do not matter) plus volatility and the function's own
 * settings such as search_path. The harness stub gen_random_bytes is left out; production gets it from pgcrypto.
 */
export const FUNCTION_FINGERPRINT_SQL =
  `select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')|def=' || p.prosecdef::text || '|h:' || left(md5(btrim(regexp_replace(p.prosrc, '\\s+', ' ', 'g')) || '/' || p.provolatile::text || '/' || coalesce(p.proconfig::text, '')), 8), ' ; ' order by p.proname) as fp from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname not like 'health360%' and p.proname not like 'validation%' and p.proname <> 'gen_random_bytes'`

export interface TableFingerprint { rls: boolean; columns: string; constraints: string; indexes: string; policies: string; triggers: string }

export function parseTableFingerprint(cell: string): Record<string, TableFingerprint> {
  const out: Record<string, TableFingerprint> = {}
  for (const row of cell.split(' ; ').map(s => s.trim()).filter(Boolean)) {
    const [name, rls, c, k, i, p, t] = row.split('|')
    out[name] = { rls: rls === 'rls=true', columns: c.slice(2), constraints: k.slice(2), indexes: i.slice(2), policies: p.slice(2), triggers: t.slice(2) }
  }
  return out
}

export function parseFunctionFingerprint(cell: string): Record<string, { securityDefiner: boolean; hash: string }> {
  const out: Record<string, { securityDefiner: boolean; hash: string }> = {}
  for (const row of cell.split(' ; ').map(s => s.trim()).filter(Boolean)) {
    const [sig, def, h2] = row.split('|')
    out[sig] = { securityDefiner: def === 'def=true', hash: h2.slice(2) }
  }
  return out
}

export interface FingerprintDifference { table: string; parts: string[] }

/** Which tables differ between two fingerprints, and in which part. Tables present on one side only are reported too. */
export function diffTableFingerprints(a: Record<string, TableFingerprint>, b: Record<string, TableFingerprint>): FingerprintDifference[] {
  const out: FingerprintDifference[] = []
  for (const name of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    if (!a[name]) { out.push({ table: name, parts: ['missing on the left'] }); continue }
    if (!b[name]) { out.push({ table: name, parts: ['missing on the right'] }); continue }
    const parts = (['rls', 'columns', 'constraints', 'indexes', 'policies', 'triggers'] as const).filter(p => a[name][p] !== b[name][p])
    if (parts.length) out.push({ table: name, parts: [...parts] })
  }
  return out
}
