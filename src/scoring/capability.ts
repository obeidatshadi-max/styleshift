import { behaviorIndex, defaultScoringConfig } from '@/scoring/config'
import rawConfig from './capability.config.json'

export const CAPABILITY_DIMENSIONS = ['interaction', 'clinical', 'adaptation', 'discovery', 'commitment'] as const
export type CapabilityDimension = typeof CAPABILITY_DIMENSIONS[number]

export type Band = 'developing' | 'building' | 'strong' | 'advanced'

export interface DimensionConfig {
  description: string
  /** Set when the dimension cannot yet measure everything its name implies. */
  limit: 'accuracy_not_measured' | null
  /** scoring-catalog behavior key -> relative weight (> 0). */
  behaviors: Record<string, number>
}

export interface CapabilityConfig {
  version: string
  /** Most recent scored sessions considered. */
  window: number
  /** A dimension needs this many behavior events... */
  minEvents: number
  /** ...across at least this many different sessions, or it is not scored. */
  minSessions: number
  trend: { minSessions: number; minChange: number }
  /** Scores are rounded to a multiple of this, to avoid false precision. */
  roundTo: number
  /** Weight of an imaginary neutral observation added to every session, so a single event cannot swing a session to 0 or 100. */
  shrinkage: number
  bands: Record<Band, number>
  dimensions: Record<CapabilityDimension, DimensionConfig>
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Validates the capability config; throws a precise message so a bad edit fails loudly. */
export function parseCapabilityConfig(raw: unknown): CapabilityConfig {
  const fail = (msg: string): never => { throw new Error(`Invalid capability config: ${msg}`) }
  if (!raw || typeof raw !== 'object') return fail('not an object')
  const c = raw as Record<string, unknown>
  if (typeof c.version !== 'string' || !c.version) fail('version is required')
  for (const k of ['window', 'minEvents', 'minSessions', 'roundTo'] as const) {
    if (!isNum(c[k]) || !Number.isInteger(c[k]) || (c[k] as number) < 1) fail(`${k} must be a whole number >= 1`)
  }
  if (!isNum(c.shrinkage) || c.shrinkage < 0) fail('shrinkage must be a number >= 0')
  const trend = c.trend as Record<string, unknown> | undefined
  if (!trend || !isNum(trend.minSessions) || !isNum(trend.minChange) || trend.minSessions < 2 || trend.minChange <= 0) fail('trend.minSessions (>=2) and trend.minChange (>0) are required')
  const bandsRaw = c.bands as Record<string, unknown> | undefined
  const bands = {} as Record<Band, number>
  let last = -1
  for (const b of ['developing', 'building', 'strong', 'advanced'] as const) {
    const v = bandsRaw?.[b]
    if (!isNum(v) || v < 0 || v > 100 || v <= last) fail(`bands.${b} must increase from the previous band and stay within 0-100`)
    bands[b] = v as number; last = v as number
  }
  if (bands.developing !== 0) fail('bands.developing must be 0')

  const catalog = behaviorIndex(defaultScoringConfig)
  const claimed = new Map<string, string>()
  const dims = c.dimensions as Record<string, unknown> | undefined
  const dimensions = {} as Record<CapabilityDimension, DimensionConfig>
  for (const name of CAPABILITY_DIMENSIONS) {
    const d = dims?.[name] as Record<string, unknown> | undefined
    if (!d || typeof d.description !== 'string') { fail(`missing dimension "${name}"`); continue }
    const limit = d.limit === undefined ? null : d.limit
    if (limit !== null && limit !== 'accuracy_not_measured') fail(`${name}.limit is not recognised`)
    const behaviors: Record<string, number> = {}
    for (const [key, w] of Object.entries((d.behaviors ?? {}) as Record<string, unknown>)) {
      if (!catalog.has(key)) fail(`${name}: "${key}" is not in the scoring catalog`)
      if (!isNum(w) || w <= 0) fail(`${name}.${key}: weight must be > 0`)
      if (claimed.has(key)) fail(`"${key}" is in both ${claimed.get(key)} and ${name}`)
      claimed.set(key, name)
      behaviors[key] = w as number
    }
    if (!Object.keys(behaviors).length) fail(`${name} needs at least one behavior`)
    dimensions[name] = { description: d.description, limit: limit as DimensionConfig['limit'], behaviors }
  }
  return {
    version: c.version as string, window: c.window as number, minEvents: c.minEvents as number, minSessions: c.minSessions as number,
    trend: { minSessions: trend!.minSessions as number, minChange: trend!.minChange as number }, roundTo: c.roundTo as number, shrinkage: c.shrinkage as number, bands, dimensions,
  }
}

export const defaultCapabilityConfig: CapabilityConfig = parseCapabilityConfig(rawConfig)

/** behavior key -> dimension, for the whole config. */
export function dimensionOfBehavior(cfg: CapabilityConfig): Map<string, CapabilityDimension> {
  const out = new Map<string, CapabilityDimension>()
  for (const name of CAPABILITY_DIMENSIONS) for (const key of Object.keys(cfg.dimensions[name].behaviors)) out.set(key, name)
  return out
}
