import { EN_A } from './en-a'
import { EN_B } from './en-b'
import { IQ_A } from './iq-a'
import { IQ_B } from './iq-b'
import { CS_A } from './cs-a'
import { CS_B } from './cs-b'
import type { BenchFixture } from './types'

export const FIXTURES: BenchFixture[] = [...EN_A, ...EN_B, ...IQ_A, ...IQ_B, ...CS_A, ...CS_B]

/** Iraqi and code-switched fixtures: the Arabic subset the blind review leans on. */
export const ARABIC_FIXTURES = FIXTURES.filter(f => f.mix !== 'en')

export { toSession } from './types'
export type { BenchFixture } from './types'
