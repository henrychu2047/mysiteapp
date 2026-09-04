import type { Photo } from './photo-storage'

export type PhotoSource = Pick<Photo, 'id' | 'src' | 'category' | 'createdAt'>

export function photoSourceMap(photos: Photo[]): Record<string, PhotoSource> {
  return Object.fromEntries(photos.map(({ id, src, category, createdAt }) => [id, { id, src, category, createdAt }]))
}

export function resolveAttachmentPhoto(photoId: string | undefined, legacySource: string | undefined, sources: Record<string, PhotoSource>): string | undefined {
  return photoId ? sources[photoId]?.src : legacySource || undefined
}
