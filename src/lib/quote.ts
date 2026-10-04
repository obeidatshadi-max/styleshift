const QUOTE_CHARS = '"“”„‟«»\'‘’'
const EDGE_QUOTES = new RegExp(String.raw`^[\s${QUOTE_CHARS}]+|[\s${QUOTE_CHARS}]+$`, 'g')

/** Shows text as a quotation in the reader's language: “…” in English, «…» in Arabic.
 * Any quotation marks already around the text are removed first, so a string that
 * carries its own (the Arabic opening lines do) is not wrapped twice. */
export function quoted(text: string, lang: 'en' | 'ar'): string {
  const inner = text.replace(EDGE_QUOTES, '')
  return lang === 'ar' ? `«${inner}»` : `“${inner}”`
}
