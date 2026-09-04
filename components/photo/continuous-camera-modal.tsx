'use client'

import { useEffect, useState } from 'react'
import { useContinuousCamera } from '@/hooks/use-continuous-camera'

type Props = {
  categories: string[]
  initialCategory?: string
  onCapture: (file: File, category: string) => Promise<void>
  onClose: () => void
  onOpenPhotoSettings?: () => void
}

export function ContinuousCameraModal({ categories, initialCategory, onCapture, onClose, onOpenPhotoSettings }: Props) {
  const [category, setCategory] = useState(initialCategory && categories.includes(initialCategory) ? initialCategory : '')
  const { continuousCamera, cameraError, captureBusy, captureMessage, flashEnabled, zoomLevel, videoRef, startContinuousCamera, stopContinuousCamera, toggleFlash, changeZoom, capturePhoto } = useContinuousCamera()

  useEffect(() => () => stopContinuousCamera(), [stopContinuousCamera])

  const close = () => { stopContinuousCamera(); onClose() }
  const openPhotoSettings = () => { stopContinuousCamera(); onClose(); onOpenPhotoSettings?.() }
  const start = () => { if (category) void startContinuousCamera() }

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
      <div className="camera-toolbar"><button className="camera-control" onClick={close} aria-label="取消拍攝">×</button><button className={`shutter ${captureBusy ? 'is-busy' : ''}`} onClick={() => void capturePhoto(file => onCapture(file, category))} disabled={captureBusy} aria-label="拍攝相片">{captureBusy ? '…' : ''}</button>{onOpenPhotoSettings ? <button className="camera-control camera-settings" onClick={openPhotoSettings} aria-label="拍照記錄設定">⚙</button> : <span>連續拍攝</span>}</div>
    </div></div>
  )
}
