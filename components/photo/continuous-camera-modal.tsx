'use client'

import { useEffect, useRef, useState } from 'react'
import { useContinuousCamera } from '@/hooks/use-continuous-camera'
import { SMART_TAG_KEYS } from '@/lib/project-settings'

type Props = {
  categories: string[]
  initialCategory?: string
  tags: Record<string, string>
  visibleTags: string[]
  tagOptions: Record<string, string[]>
  note: string
  noteHistory: string[]
  selectedNotes: string[]
  onCapture: (file: File, category: string) => Promise<void>
  onClose: () => void
  autoStart?: boolean
  onCategorySelected?: (category: string) => void
  onSelectTag: (label: string, value: string) => void
  onNoteChange: (note: string) => void
  onRememberNote: () => void
  onToggleRecentNote: (note: string) => void
  onToggleVisibleTag: (label: string) => void
}

const CAMERA_TAG_ORDER = ['座數', '樓層', '位置', '收貨相關', '事項', '安全']

export function ContinuousCameraModal({ categories, initialCategory, tags, visibleTags, tagOptions, note, noteHistory, selectedNotes, onCapture, onClose, autoStart = false, onCategorySelected, onSelectTag, onNoteChange, onRememberNote, onToggleRecentNote, onToggleVisibleTag }: Props) {
  const [category, setCategory] = useState(initialCategory && categories.includes(initialCategory) ? initialCategory : (autoStart ? categories[0] || '' : ''))
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [showSmartTagSettings, setShowSmartTagSettings] = useState(false)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [customTagOption, setCustomTagOption] = useState('')
  const autoStartRequested = useRef(false)
  const { continuousCamera, cameraError, captureBusy, flashEnabled, zoomLevel, videoRef, startContinuousCamera, stopContinuousCamera, toggleFlash, changeZoom, capturePhoto } = useContinuousCamera()
  const selectedTags = CAMERA_TAG_ORDER.flatMap(label => {
    const value = tags[label]
    return visibleTags.includes(label) && value && value !== 'N/A' ? [{ label, value }] : []
  })

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
      <div className="camera-frame"><video ref={videoRef} autoPlay playsInline muted /><span className="camera-capture-flash" aria-hidden="true" /><span className="frame-corner top-left" /><span className="frame-corner top-right" /><span className="frame-corner bottom-left" /><span className="frame-corner bottom-right" /><div className="camera-tag-summary" aria-label="已選 Smart Tag"><span><b>工程類別</b>{category}</span>{selectedTags.map(({ label, value }) => <span key={label}><b>{label}</b>{value}</span>)}</div><div className="zoom-controls" aria-label="縮放倍率">{[.5, 1, 2, 5].map(level => <button key={level} onClick={() => void changeZoom(level)} className={zoomLevel === level ? 'selected' : ''}>{level === 1 ? '1×' : level}</button>)}</div></div>
      {cameraError && <p className="camera-error">{cameraError}</p>}
      <div className="camera-toolbar"><button className="camera-control" onClick={close} aria-label="取消拍攝">×</button><button className={`shutter ${captureBusy ? 'is-busy' : ''}`} onClick={() => void capturePhoto(file => onCapture(file, category))} disabled={captureBusy} aria-label="拍攝相片">{captureBusy ? '…' : ''}</button>{autoStart ? <button className="camera-control camera-settings" onClick={() => setShowCategoryPicker(true)} aria-label="開啟相片標記設定">⚙</button> : <span>連續拍攝</span>}</div>
      {showCategoryPicker && <div className="camera-category-popup" role="dialog" aria-modal="true" aria-label={showSmartTagSettings ? 'SMART TAG 顯示設定' : selectedTag === '__category__' ? '工程類別' : selectedTag || '相片標記設定'}>{showSmartTagSettings ? <><div className="sheet-handle" /><div className="section-heading compact"><div><p className="eyebrow">SMART TAGS</p><h3>顯示設定</h3></div><button className="close" onClick={() => setShowSmartTagSettings(false)} aria-label="返回相片標記設定">‹</button></div><p className="settings-intro">選擇拍攝資訊要顯示的標籤。</p><div className="tag-panel"><div className="tag-grid">{SMART_TAG_KEYS.map(label => <button type="button" className={`tag-chip ${visibleTags.includes(label) ? 'chosen' : ''}`} key={label} onClick={() => onToggleVisibleTag(label)}><span>{label}</span><b>{visibleTags.includes(label) ? '已顯示' : '已隱藏'}</b></button>)}</div></div></> : selectedTag ? <><div className="sheet-handle" /><div className="section-heading compact"><div><p className="eyebrow">SELECT OPTION</p><h3>{selectedTag === '__category__' ? '工程類別' : selectedTag}</h3></div><button className="close" onClick={() => { setCustomTagOption(''); setSelectedTag(null) }} aria-label="返回相片標記設定">‹</button></div><div className="tag-panel"><div className="tag-grid">{selectedTag === '__category__' ? categories.map(item => <button type="button" className={`tag-chip ${category === item ? 'chosen' : ''}`} key={item} onClick={() => { setCategory(item); onCategorySelected?.(item); setSelectedTag(null) }}><span>工程類別</span><b>{item}</b></button>) : <><button type="button" className={`tag-chip ${tags[selectedTag] === 'N/A' ? 'chosen' : ''}`} onClick={() => { onSelectTag(selectedTag, 'N/A'); setSelectedTag(null) }}><span>N/A</span><b>不適用</b></button>{(selectedTag === '位置' && tags['樓層'] ? tagOptions[`位置:${tags['樓層']}`] || tagOptions['位置'] || [] : tagOptions[selectedTag] || []).map(option => <button type="button" className={`tag-chip ${tags[selectedTag] === option ? 'chosen' : ''}`} key={option} onClick={() => { onSelectTag(selectedTag, option); setSelectedTag(null) }}><span>{selectedTag}</span><b>{option}</b></button>)}</>}</div>{selectedTag !== '__category__' && <div className="custom-option"><input value={customTagOption} onChange={event => setCustomTagOption(event.target.value)} placeholder="新增自訂項目" onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229 && customTagOption.trim()) { onSelectTag(selectedTag, customTagOption.trim()); setCustomTagOption(''); setSelectedTag(null) } }} /><button type="button" onClick={() => { const value = customTagOption.trim(); if (value) { onSelectTag(selectedTag, value); setCustomTagOption(''); setSelectedTag(null) } }}>新增</button></div>}</div></> : <><div className="sheet-handle" /><div className="section-heading compact"><div><p className="eyebrow">PHOTO SETTINGS</p><h3>相片標記設定</h3></div><button className="close" onClick={() => setShowCategoryPicker(false)} aria-label="關閉">×</button></div><div className="tag-panel"><div className="section-heading compact"><div><p className="eyebrow">SMART TAGS</p><h3>拍攝資訊</h3></div><span className="memory-dot">● 已記憶</span></div><div className="tag-grid"><button type="button" className="tag-chip category-tag-chip chosen" onClick={() => setSelectedTag('__category__')}><span>工程類別</span><b>{category || '選擇'}</b></button>{visibleTags.map(label => { const disabled = label === '位置' && !tags['樓層']; return <button type="button" className={`tag-chip ${tags[label] ? 'chosen' : ''}`} key={label} disabled={disabled} onClick={() => setSelectedTag(label)}><span>{label}</span><b>{disabled ? '請先選樓層' : (tags[label] || '選擇')}</b></button> })}<button type="button" className="tag-chip" onClick={() => setShowSmartTagSettings(true)}><span>設定</span><b>SMART TAG 顯示</b></button></div><label className="note-field"><span>文字備註</span><input value={note} onChange={event => onNoteChange(event.target.value)} onBlur={onRememberNote} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) { onRememberNote(); event.currentTarget.blur() } }} placeholder="輸入本次拍攝的補充說明..." /></label>{noteHistory.length > 0 && <div className="note-history"><small>最近使用</small><div>{noteHistory.map(item => <button type="button" key={item} onClick={() => onToggleRecentNote(item)} className={selectedNotes.includes(item) ? 'selected' : ''} aria-pressed={selectedNotes.includes(item)}>{item}</button>)}</div></div>}</div></>}</div>}
    </div></div>
  )
}
