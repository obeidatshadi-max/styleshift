/**
 * The practical "concise" band for a single-shot spoken statement (opening,
 * closing) — replaces the judge model's text-only guess with the actual
 * recorded duration. Per the evaluation doc's recommended measurement.
 */
export const CONCISE_DURATION_BAND: readonly [number, number] = [30, 50]

export function isConciseDuration(seconds: number): boolean {
  return seconds >= CONCISE_DURATION_BAND[0] && seconds <= CONCISE_DURATION_BAND[1]
}
