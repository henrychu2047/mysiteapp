'use client'

import { useEffect, useState } from 'react'
import type { PhotoSource } from '@/lib/photo-attachments'

type Props = {
  photos: PhotoSource[]
  onConfirm: (photoIds: string[]) => void
  onClose: () => void
}

export function PhotoPicker({ photos, onConfirm, onClose }: Props) {
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => setSelected([]), [photos])

  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])

  return (
    <div className="overlay photo-picker-overlay" onClick={onClose}>
      <section className="sheet photo-picker-sheet" onClick={event => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="section-heading compact">
          <div><p className="eyebrow">PROJECT ALBUM</p><h3>從相簿選取相片</h3></div>
          <button className="close" onClick={onClose} aria-label="關閉">×</button>
        </div>
        {!photos.length && <p className="empty-state">此 Project 相簿尚未有相片。</p>}
        <div className="photo-picker-grid">
          {photos.map(photo => <button key={photo.id} type="button" className={selected.includes(photo.id) ? 'selected' : ''} onClick={() => toggle(photo.id)} aria-pressed={selected.includes(photo.id)}>
            <img src={photo.src} alt={photo.category} />
            <span>{photo.category}</span><b>{selected.includes(photo.id) ? '✓' : ''}</b>
          </button>)}
        </div>
        <button className="primary-button" disabled={!selected.length} onClick={() => onConfirm(selected)}>加入 {selected.length} 張相片</button>
      </section>
    </div>
  )
}
