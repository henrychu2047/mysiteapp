import type { Photo } from './photo-storage'
import { createPhotoStampContent } from './photo-stamp'

export type PhotoSource = Pick<Photo, 'id' | 'src' | 'category' | 'tags' | 'note' | 'createdAt'>

export function photoSourceMap(photos: Photo[]): Record<string, PhotoSource> {
  return Object.fromEntries(photos.map(({ id, src, category, tags, note, createdAt }) => [id, { id, src, category, tags, note, createdAt }]))
}

export function photoSourceDescription(source: PhotoSource): string {
  const content = createPhotoStampContent({ category: source.category, tags: source.tags, note: source.note })
  const details = content.rows.map(({ label, value }) => `${label}：${value}`)
  if (content.note) details.push(`備註：${content.note}`)
  return details.join(' / ')
}

export function resolveAttachmentPhoto(photoId: string | undefined, legacySource: string | undefined, sources: Record<string, PhotoSource>): string | undefined {
  return photoId ? sources[photoId]?.src : legacySource || undefined
}
