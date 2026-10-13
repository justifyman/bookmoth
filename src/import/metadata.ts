/** A readable title (and maybe an author) guessed from a file name. */
export function fromFileName(name: string): { title: string; author: string } {
  let base = name.replace(/\.[a-z0-9]{2,5}$/i, '')
  base = base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
  // drop download leftovers such as "(1)" or "[epub]"
  base = base.replace(/\s*[([](\d+|epub|pdf|ebook|z-lib[^)\]]*|retail)[)\]]\s*/gi, ' ').trim()
  let title = base
  let author = ''
  const by = /^(.*?)\s+by\s+(.+)$/i.exec(base)
  const dash = /^(.+?)\s+[-–—]\s+(.+)$/.exec(base)
  if (by) {
    title = by[1]
    author = by[2]
  } else if (dash) {
    // "Author - Title" is the commonest order for e-book file names
    author = dash[1]
    title = dash[2]
  } else if (!/\s/.test(base) && /[-.]/.test(base)) {
    title = base.replace(/[-.]+/g, ' ')
  }
  const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()
  title = tidy(title)
  if (title && title === title.toLowerCase()) title = title.replace(/\b[a-z]/g, (c) => c.toUpperCase())
  return { title: title || 'Untitled book', author: tidy(author) }
}

/** Metadata fields are often filled with junk by the software that made the file. */
export function usable(value: unknown): string {
  if (typeof value !== 'string') return ''
  const v = value.replace(/\s+/g, ' ').trim()
  if (!v || v.length > 200) return ''
  if (/^(untitled|unknown|null|undefined|none)$/i.test(v)) return ''
  if (/\.(docx?|indd|qxd|pdf|tex|dvi|rtf|pages)$/i.test(v) || /^microsoft word/i.test(v)) return ''
  return v
}
