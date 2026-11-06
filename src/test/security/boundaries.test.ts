import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Repo-wide guards for the boundary between browser code and server-only power. */

const ROOT = process.cwd()
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== '.next') walk(p, out) } else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}
const src = walk(join(ROOT, 'src')).filter(f => !/\.test\.tsx?$/.test(f) && !f.includes(`${join('src', 'test')}`))
const read = (f: string) => readFileSync(f, 'utf8')
const isClient = (s: string) => /^\s*['"]use client['"]/.test(s)

describe('browser code never gets server-only power', () => {
  it('no client component imports the admin (service-role) client', () => {
    const offenders = src.filter(f => isClient(read(f)) && /supabase-admin/.test(read(f)))
    expect(offenders).toEqual([])
  })

  it('the service-role key is read in exactly one place', () => {
    const readers = src.filter(f => /SUPABASE_SERVICE_ROLE_KEY/.test(read(f))).map(f => f.replace(ROOT, '').replace(/\\/g, '/'))
    expect(readers).toEqual(['/src/lib/debrief-recovery.ts', '/src/lib/supabase-admin.ts'])
  })

  it('no variable that sounds like a secret is exposed to the browser with NEXT_PUBLIC_', () => {
    const exposed = new Set<string>()
    for (const f of src) for (const m of read(f).matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) exposed.add(m[0])
    const risky = [...exposed].filter(n => /SECRET|PRIVATE|SERVICE|PASSWORD|TOKEN/.test(n) || (/KEY/.test(n) && !/ANON_KEY|PUBLIC_KEY|VAPID_PUBLIC_KEY/.test(n)))
    expect(risky).toEqual([])
  })

  it('the example environment file holds no real-looking secret values', () => {
    const lines = read(join(ROOT, '.env.example')).split(/\r?\n/).filter(l => /^[A-Z0-9_]+=/.test(l))
    const filled = lines.filter(l => { const v = l.slice(l.indexOf('=') + 1).trim(); return v.length >= 32 &&!/^https?:\/\//.test(v) })
    expect(filled).toEqual([])
  })
})
