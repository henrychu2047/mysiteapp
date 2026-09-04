'use client'

import { useEffect, useRef, useState } from 'react'
import { useContinuousCamera } from '@/hooks/use-continuous-camera'

type Props = {
  categories: string[]
  initialCategory?: string
  tags: Record<string, string>
  visibleTags: string[]
  note: string
  noteHistory: string[]
  selectedNotes: string[]
  onCapture: (file: File, category: string) => Promise<void>
  onClose: () => void
  autoStart?: boolean
  onCategorySelected?: (category: string) => void
  onSelectTag: (label: string) => void
  onNoteChange: (note: string) => void
  onRememberNote: () => void
  onToggleRecentNote: (note: string) => void
}

export function ContinuousCameraModal({ categories, initialCategory, tags, visibleTags, note, noteHistory, selectedNotes, onCapture, onClose, autoStart = false, onCategorySelected, onSelectTag, onNoteChange, onRememberNote, onToggleRecentNote }: Props) {
  const [category, setCategory] = useState(initialCategory && categories.includes(initialCategory) ? initialCategory : (autoStart ? categories[0] || '' : ''))
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [showCategoryOptions, setShowCategoryOptions] = useState(false)
  const autoStartRequested = useRef(false)
  const { continuousCamera, cameraError, captureBusy, captureMessage, flashEnabled, zoomLevel, videoRef, startContinuousCamera, stopContinuousCamera, toggleFlash, changeZoom, capturePhoto } = useContinuousCamera()

  useEffect(() => () => stopContinuousCamera(), [stopContinuousCamera])
  useEffect(() => {
    if (!autoStart || !category || autoStartRequested.current) return
    autoStartRequested.current = true
    onCategorySelected?.(category)
    void startContinuousCamera()
  }, [autoStart, category, onCategorySelected, startContinuousCamera])

  const close = () => { stopContinuousCamera(); onClose() }
  const start = () => { if (category) { onCategorySelected?.(category); void startContinuousCamera() } }

  if (!continuousCamera && autoStart) return (
    <div className="overlay dark-overlay camera-overlay"><div className="camera-starting" role="status">正在開啟相機…{cameraError && <><p className="camera-error">{cameraError}</p><button className="camera-control" onClick={close}>×</button></>}</div></div>
  )

  if (!continuousCamera) return (
    <div className="overlay photo-picker-overlay" onClick={close}>
      <section className="sheet camera-category-sheet" onClick={event => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="section-heading compact"><div><p className="eyebrow">CONTINUOUS CAMERA</p><h3>選擇相簿分類</h3></div><button className="close" onClick={close} aria-label="關閉">×</button></div>
        <p className="settings-intro">拍攝的相片會直接加入目前 Project 相簿，再供功能引用。</p>
        <div className="camera-category-list">{categories.map(item => <button type="button" key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}<span>{category === item ? '✓' : ''}</span></button>)}</div>
        {cameraError && <p className="camera-error">{cameraError}</p>}
        <button className="primary-button" disabled={!category} onClick={start}>開啟連續相機</button>
      </section>
    </div>
  )

  return (
    <div className="overlay dark-overlay camera-overlay"><div className="camera-sheet">
      <div className="camera-topline"><span className="camera-spacer" aria-hidden="true" /><button className={`camera-flash ${flashEnabled ? 'selected' : ''}`} onClick={() => void toggleFlash()} aria-label="切換閃光燈">ϟ<span>{flashEnabled ? 'ON' : 'A'}</span></button><div className="camera-status"><i /> LIVE · {category}</div></div>
      {captureMessage && <p className="capture-message" role="status">{captureMessage}</p>}
      <div className="camera-frame"><video ref={videoRef} autoPlay playsInline muted /><span className="frame-corner top-left" /><span className="frame-corner top-right" /><span className="frame-corner bottom-left" /><span className="frame-corner bottom-right" /><div className="zoom-controls" aria-label="縮放倍率">{[.5, 1, 2, 5].map(level => <button key={level} onClick={() => void changeZoom(level)} className={zoomLevel === level ? 'selected' : ''}>{level === 1 ? '1×' : level}</button>)}</div></div>
      {cameraError && <p className="camera-error">{cameraError}</p>}
      <div className="camera-toolbar"><button className="camera-control" onClick={close} aria-label="取消拍攝">×</button><button className={`shutter ${captureBusy ? 'is-busy' : ''}`} onClick={() => void capturePhoto(file => onCapture(file, category))} disabled={captureBusy} aria-label="拍攝相片">{captureBusy ? '…' : ''}</button>{autoStart ? <button className="camera-control camera-settings" onClick={() => setShowCategoryPicker(true)} aria-label="開啟相片標記設定">⚙</button> : <span>連續拍攝</span>}</div>
      {showCategoryPicker && <div className="camera-category-popup" role="dialog" aria-modal="true" aria-label="相片標記設定"><div className="sheet-handle" /><div className="section-heading compact"><div><p className="eyebrow">PHOTO SETTINGS</p><h3>相片標記設定</h3></div><button className="close" onClick={() => setShowCategoryPicker(false)} aria-label="關閉">×</button></div><div className="tag-panel"><div className="section-heading compact"><div><p className="eyebrow">SMART TAGS</p><h3>拍攝資訊</h3></div><span className="memory-dot">● 已記憶</span></div><div className="tag-grid"><button type="button" className="tag-chip category-tag-chip chosen" onClick={() => setShowCategoryOptions(current => !current)}><span>工程類別</span><b>{category || '選擇'}</b></button>{visibleTags.map(label => { const disabled = label === '位置' && !tags['樓層']; return <button type="button" className={`tag-chip ${tags[label] ? 'chosen' : ''}`} key={label} disabled={disabled} onClick={() => onSelectTag(label)}><span>{label}</span><b>{disabled ? '請先選樓層' : (tags[label] || '選擇')}</b></button> })}</div>{showCategoryOptions && <div className="camera-category-list smart-category-list">{categories.map(item => <button type="button" key={item} className={category === item ? 'selected' : ''} onClick={() => { setCategory(item); onCategorySelected?.(item); setShowCategoryOptions(false) }}>{item}<span>{category === item ? '✓' : ''}</span></button>)}</div>}<label className="note-field"><span>文字備註</span><input value={note} onChange={event => onNoteChange(event.target.value)} onBlur={onRememberNote} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) { onRememberNote(); event.currentTarget.blur() } }} placeholder="輸入本次拍攝的補充說明..." /></label>{noteHistory.length > 0 && <div className="note-history"><small>最近使用</small><div>{noteHistory.map(item => <button type="button" key={item} onClick={() => onToggleRecentNote(item)} className={selectedNotes.includes(item) ? 'selected' : ''} aria-pressed={selectedNotes.includes(item)}>{item}</button>)}</div></div>}</div></div>}
    </div></div>
  )
}
