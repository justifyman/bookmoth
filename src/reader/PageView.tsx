import { memo } from 'react'
import { useBlobUrl } from '../library/Cover'
import type { ImageItem, Page, TypeSettings } from '../pagination/types'

// Draws one paginated page as real text in the document, using the exact line
// positions worked out by the pagination engine.

function Picture({ item }: { item: ImageItem }) {
  const url = useBlobUrl(item.blob)
  return url ? <img src={url} alt={item.alt} draggable={false} style={{ position: 'absolute', left: item.x, top: item.y, width: item.width, height: item.height }} /> : null
}

export const PageView = memo(function PageView({ page, type, width, height }: { page: Page; type: TypeSettings; width: number; height: number }) {
  return (
    <div style={{ position: 'relative', width, height, fontFamily: `"${type.fontFamily}", Georgia, serif`, fontKerning: 'normal' }}>
      {page.items.map((item, i) => {
        if (item.kind === 'image') return <Picture key={i} item={item} />
        if (item.kind === 'ornament') {
          return (
            <div key={i} aria-hidden="true" style={{ position: 'absolute', top: item.y, left: 0, width, height: item.height, lineHeight: `${item.height}px`, textAlign: 'center', fontSize: type.fontSize, letterSpacing: '0.6em', opacity: 0.6 }}>
              ***
            </div>
          )
        }
        return (
          <div key={i} role={item.heading ? 'heading' : undefined} aria-level={item.heading || undefined} style={{ position: 'absolute', top: item.y, left: 0, width, height: item.height, lineHeight: `${item.height}px`, fontSize: item.size, whiteSpace: 'pre' }}>
            {item.segments.map((s, k) => (
              <span key={k} style={{ position: 'absolute', left: s.x, fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal' }}>
                {s.text + ' '}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
})
