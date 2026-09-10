'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { BottomNav } from '@/components/ui/bottom-nav'
import { StandaloneToolbar } from '@/components/ui/standalone-toolbar'
import { Send, Settings2, Zap } from 'lucide-react'
import { resolveAttachmentPhoto, type PhotoSource } from '@/lib/photo-attachments'
import { loadNotebook, saveNotebook, type NotebookEntry } from '@/lib/notebook-storage'

type Props = {
  projectId: string
  projectName: string
  onBack: () => void
  onNavigate: (mode: 'home' | 'photo' | 'handover' | 'about') => void
  photoSources: Record<string, PhotoSource>
  onSelectAlbumPhotos: (onSelect: (photoIds: string[]) => void) => void
  onOpenCamera: (onCapture: (photoId: string) => void) => void
  showNavigation?: boolean
  onOpenSettings?: () => void
  isRegistered: boolean
}

const categories = ['待辦', '問題', '進度', '交辦']

export function Notebook({ projectId, projectName, onBack, onNavigate, photoSources, onSelectAlbumPhotos, onOpenCamera, showNavigation = true, onOpenSettings, isRegistered }: Props) {
  const [entries, setEntries] = useState<NotebookEntry[]>([])
  const [text, setText] = useState('')
  const [category, setCategory] = useState('待辦')
  const [filter, setFilter] = useState('全部')
  const [query, setQuery] = useState('')
  const [photoIds, setPhotoIds] = useState<string[]>([])
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [quickMode, setQuickMode] = useState(false)
  const [pullToAddEnabled, setPullToAddEnabled] = useState(false)
  const [quickEntryId, setQuickEntryId] = useState<string | null>(null)
  const notebookBodyRef = useRef<HTMLElement | null>(null)
  const composeTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [saveError, setSaveError] = useState('')
  const swipeStart = useRef<{ x: number; y: number; id: string } | null>(null)
  const swipeOffsetRef = useRef(0)
  const [swipeEntryId, setSwipeEntryId] = useState<string | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const loadedProjectRef = useRef<string | null>(null)
  const preferencesLoadPendingRef = useRef(false)

  useEffect(() => {
    preferencesLoadPendingRef.current = true
    try {
      const saved = localStorage.getItem(`notebook-preferences:${projectId}`)
      const preferences = saved ? JSON.parse(saved) as { quickMode?: boolean; pullToAddEnabled?: boolean } : {}
      setQuickMode(Boolean(preferences.quickMode))
      setPullToAddEnabled(Boolean(preferences.pullToAddEnabled))
    } catch {
      setQuickMode(false)
      setPullToAddEnabled(false)
    }
  }, [projectId])

  useEffect(() => {
    if (preferencesLoadPendingRef.current) {
      preferencesLoadPendingRef.current = false
      return
    }
    try {
      localStorage.setItem(`notebook-preferences:${projectId}`, JSON.stringify({ quickMode, pullToAddEnabled }))
    } catch { /* 本機儲存不可用時仍可正常使用 */ }
  }, [projectId, quickMode, pullToAddEnabled])

  useEffect(() => {
    try {
      setEntries(loadNotebook(projectId))
      setSaveError('')
    } catch { setEntries([]) }
    loadedProjectRef.current = projectId
  }, [projectId])

  useEffect(() => {
    if (loadedProjectRef.current !== projectId) return
    try {
      saveNotebook(projectId, entries)
      setSaveError('')
    } catch (error) {
      console.error('記事簿保存失敗:', error)
      setSaveError('記事簿保存失敗，請檢查裝置儲存空間')
    }
  }, [entries, projectId])

  const addEntry = () => {
    const value = text.trim()
    if (!value && !photoIds.length) return
    setEntries(current => [{ id: `${Date.now()}-${Math.random()}`, text: value, category, done: false, pinned: false, createdAt: new Date().toISOString(), photoId: photoIds[0], photoIds }, ...current])
    setText(''); setPhotoIds([]); setShowCompose(false); setEditingEntryId(null)
    setQuickEntryId(null)
  }
  const openCompose = () => { setText(''); setPhotoIds([]); setQuickEntryId(null); setEditingEntryId(null); setShowCompose(true) }
  const closeCompose = () => { setText(''); setPhotoIds([]); setQuickEntryId(null); setEditingEntryId(null); setShowCompose(false) }
  const editEntry = (entry: NotebookEntry) => {
    setEditingEntryId(entry.id)
    setQuickEntryId(null)
    setText(entry.text)
    setCategory(entry.category)
    setPhotoIds(entry.photoIds?.length ? [...entry.photoIds] : entry.photoId ? [entry.photoId] : [])
    setSwipeEntryId(null)
    swipeOffsetRef.current = 0
    setSwipeOffset(0)
    setShowCompose(true)
  }
  const saveEditedEntry = () => {
    const value = text.trim()
    if (!editingEntryId || (!value && !photoIds.length)) return
    setEntries(current => current.map(entry => entry.id === editingEntryId ? { ...entry, text: value, category, photoId: photoIds[0], photoIds } : entry))
    closeCompose()
  }
  useEffect(() => {
    const body = notebookBodyRef.current
    if (!body || !isRegistered || !pullToAddEnabled || showCompose) return
    let start: { x: number; y: number; id: number } | null = null
    let distance = 0
    const cancel = () => { start = null; distance = 0; setPullDistance(0) }
    const onStart = (event: TouchEvent) => {
      cancel()
      if (event.touches.length !== 1 || body.scrollTop > 1) return
      if ((event.target as HTMLElement).closest('button, input, textarea, select, a')) return
      const touch = event.touches[0]
      start = { x: touch.clientX, y: touch.clientY, id: touch.identifier }
    }
    const onMove = (event: TouchEvent) => {
      if (!start) return
      const touch = Array.from(event.touches).find(item => item.identifier === start?.id)
      if (!touch || event.touches.length !== 1) { cancel(); return }
      const dy = touch.clientY - start.y
      if (dy < 0 || Math.abs(touch.clientX - start.x) > Math.abs(dy)) { cancel(); return }
      if (!event.cancelable) { cancel(); return }
      // Non-passive listener stops native scrolling before the threshold.
      event.preventDefault()
      distance = dy
      setPullDistance(Math.min(88, dy * .55))
    }
    const onEnd = (event: TouchEvent) => {
      const ready = start !== null && distance >= 60
      cancel()
      if (!ready) return
      // Prevent release's default focus/click from undoing textarea focus.
      if (event.cancelable) event.preventDefault()
      flushSync(() => { setText(''); setPhotoIds([]); setQuickEntryId(null); setShowCompose(true) })
      composeTextareaRef.current?.focus({ preventScroll: true })
    }
    body.addEventListener('touchstart', onStart, { passive: true })
    body.addEventListener('touchmove', onMove, { passive: false })
    body.addEventListener('touchend', onEnd, { passive: false })
    body.addEventListener('touchcancel', cancel)
    return () => {
      body.removeEventListener('touchstart', onStart)
      body.removeEventListener('touchmove', onMove)
      body.removeEventListener('touchend', onEnd)
      body.removeEventListener('touchcancel', cancel)
    }
  }, [isRegistered, pullToAddEnabled, showCompose])
  useEffect(() => {
    if (!showCompose || typeof window === 'undefined') { setKeyboardInset(0); return }
    const viewport = window.visualViewport
    if (!viewport) return
    const updateKeyboardInset = () => setKeyboardInset(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop))
    updateKeyboardInset()
    viewport.addEventListener('resize', updateKeyboardInset)
    viewport.addEventListener('scroll', updateKeyboardInset)
    return () => { viewport.removeEventListener('resize', updateKeyboardInset); viewport.removeEventListener('scroll', updateKeyboardInset) }
  }, [showCompose])
  const saveQuickEntry = (value: string, attachmentIds: string[]) => {
    if (editingEntryId) return
    if (!quickMode || (!value.trim() && !attachmentIds.length)) return
    const id = quickEntryId || `${Date.now()}-${Math.random()}`
    if (!quickEntryId) setQuickEntryId(id)
    setEntries(current => quickEntryId
      ? current.map(entry => entry.id === quickEntryId ? { ...entry, text: value, category, photoId: attachmentIds[0], photoIds: attachmentIds } : entry)
      : [{ id, text: value, category, done: false, pinned: false, createdAt: new Date().toISOString(), photoId: attachmentIds[0], photoIds: attachmentIds }, ...current])
  }
  const finishQuickEntry = () => { saveQuickEntry(text, photoIds); closeCompose() }
  const handleTextChange = (value: string) => {
    setText(value)
    saveQuickEntry(value, photoIds)
  }
  useEffect(() => {
    if (!quickMode || !quickEntryId) return
    setEntries(current => current.map(entry => entry.id === quickEntryId ? { ...entry, category, photoId: photoIds[0], photoIds } : entry))
  }, [category, photoIds, quickEntryId, quickMode])
  const toggle = (id: string, field: 'done' | 'pinned') => setEntries(current => current.map(entry => entry.id === id ? { ...entry, [field]: !entry[field] } : entry))
  const deleteEntryImmediately = (id: string) => { setEntries(current => current.filter(entry => entry.id !== id)); resetEntrySwipe() }
  const remove = (id: string) => { if (confirm('確定刪除此記事？')) { setEntries(current => current.filter(entry => entry.id !== id)); swipeOffsetRef.current = 0; setSwipeEntryId(null); setSwipeOffset(0) } }
  const handleEntryTouchStart = (event: React.TouchEvent<HTMLElement>, id: string) => {
    if (showCompose || event.touches.length !== 1) return
    const target = event.target as HTMLElement
    if (target.closest('button, input, textarea, select, a')) return
    const touch = event.touches[0]
    swipeStart.current = { x: touch.clientX, y: touch.clientY, id }
    swipeOffsetRef.current = 0
    setSwipeEntryId(null)
    setSwipeOffset(0)
  }
  const handleEntryTouchMove = (event: React.TouchEvent<HTMLElement>) => {
    const start = swipeStart.current
    if (!start || event.touches.length !== 1) return
    const touch = event.touches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 8) return
    event.preventDefault()
    const nextOffset = Math.max(-116, Math.min(116, dx))
    swipeOffsetRef.current = nextOffset
    setSwipeEntryId(start.id)
    setSwipeOffset(nextOffset)
  }
  const handleEntryTouchEnd = () => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start) return
    const finalOffset = swipeOffsetRef.current
    if (finalOffset >= 72) {
      toggle(start.id, 'pinned')
      resetEntrySwipe()
    } else if (finalOffset <= -72) {
      deleteEntryImmediately(start.id)
    } else {
      swipeOffsetRef.current = 0
      setSwipeOffset(0)
      setSwipeEntryId(null)
    }
  }
  const resetEntrySwipe = () => {
    swipeStart.current = null
    swipeOffsetRef.current = 0
    setSwipeOffset(0)
    setSwipeEntryId(null)
  }
  const visible = useMemo(() => entries.filter(entry => filter === '全部' || entry.category === filter).filter(entry => !query.trim() || entry.text.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [entries, filter, query])
  const pendingPhotos = photoIds.map(id => resolveAttachmentPhoto(id, undefined, photoSources)).filter((photo): photo is string => Boolean(photo))

  return <div className="app-shell notebook-app">
    <StandaloneToolbar projectName={projectName} onProjectClick={onBack} />
    <main className="notebook-body" ref={notebookBodyRef}>
      <div className="section-heading"><div><p className="eyebrow">SITE NOTEBOOK</p><h2>記事簿</h2></div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><button type="button" disabled={!isRegistered} onClick={() => setQuickMode(current => !current)} aria-label="開／關快速記事保存功能；輸入後按鍵盤傳送或換行鍵保存" aria-pressed={quickMode} title={isRegistered ? '開／關快速記事保存功能' : '註冊版專有功能'} style={{ display: 'grid', placeItems: 'center', width: 42, height: 42, padding: 0, border: '1px solid var(--orange)', borderRadius: 8, background: quickMode ? 'var(--orange)' : '#fff', color: quickMode ? '#fff' : 'var(--navy)', opacity: isRegistered ? 1 : .5 }}><Send size={19} aria-hidden="true" /></button><button type="button" disabled={!isRegistered} onClick={() => setPullToAddEnabled(current => !current)} aria-label="開／關下拉新增記事功能" title={isRegistered ? '開／關下拉新增記事' : '註冊版專有功能'} aria-pressed={pullToAddEnabled} style={{ display: 'grid', placeItems: 'center', width: 42, height: 42, padding: 0, border: '1px solid var(--line)', borderRadius: 8, background: pullToAddEnabled ? 'var(--blue)' : '#fff', color: pullToAddEnabled ? '#fff' : 'var(--navy)', opacity: isRegistered ? 1 : .5 }}><Zap size={22} aria-hidden="true" /></button>{!showNavigation && onOpenSettings && <button type="button" onClick={onOpenSettings} aria-label="設定" title="設定" style={{ display: 'grid', placeItems: 'center', width: 42, height: 42, padding: 0, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', color: 'var(--foreground)' }}><Settings2 size={20} aria-hidden="true" /></button>}</div></div>
      {saveError && <div className="save-toast error" role="alert">{saveError}</div>}
      <div className={`notebook-pull-indicator ${pullDistance > 0 ? 'is-pulling' : ''}`} style={{ transform: `translateY(${Math.min(44, pullDistance / 2)}px)`, opacity: Math.min(1, pullDistance / 24) }} aria-hidden="true"><span>{pullDistance >= 33 ? '放開以新增記事' : '下拉新增記事'}</span></div>
      {showCompose && <div className="notebook-modal-backdrop notebook-input-backdrop" style={{ '--notebook-keyboard-inset': `${keyboardInset}px` } as React.CSSProperties} onClick={closeCompose}><section role="dialog" aria-modal="true" aria-label={editingEntryId ? '編輯記事' : '新增記事'} className="notebook-compose notebook-modal" onClick={event => event.stopPropagation()}>
        <div className="notebook-modal-heading"><h2>{editingEntryId ? '編輯記事' : '新增記事'}</h2><button type="button" onClick={closeCompose}>×</button></div>
        <textarea ref={composeTextareaRef} autoFocus value={text} onChange={event => handleTextChange(event.target.value)} onKeyDown={event => { if (!editingEntryId && event.key === 'Enter' && quickMode && !event.shiftKey) { event.preventDefault(); finishQuickEntry() } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); editingEntryId ? saveEditedEntry() : addEntry() } }} placeholder="快速記錄現場事項…" aria-label="記事內容" />
        <div className="notebook-compose-row"><div className="notebook-compose-tools"><div className="notebook-category-quick-select" role="group" aria-label="記事分類快選">{categories.map(item => <button type="button" key={item} className={category === item ? 'chosen' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="notebook-media-actions"><button type="button" onClick={() => onSelectAlbumPhotos(ids => { const next = Array.from(new Set([...photoIds, ...ids])); setPhotoIds(next); saveQuickEntry(text, next) })}>📎 相簿</button><button type="button" onClick={() => onOpenCamera(photo => { const next = Array.from(new Set([...photoIds, photo])); setPhotoIds(next); saveQuickEntry(text, next) })}>▣ 拍攝</button></div></div>{editingEntryId || !quickMode ? <button className="primary-button" type="button" onClick={editingEntryId ? saveEditedEntry : addEntry}>{editingEntryId ? '保存修改' : '新增記事'}</button> : <span style={{ color: 'var(--blue)', fontSize: 12, fontWeight: 700 }}>輸入即自動保存</span>}</div>
        {!!photoIds.length && <div className="notebook-photo-preview">{photoIds.map((id, index) => pendingPhotos[index] ? <div className="notebook-photo-item" key={id}><img src={pendingPhotos[index]} alt={`待附加相片 ${index + 1}`} /><button type="button" onClick={() => setPhotoIds(current => current.filter(value => value !== id))}>移除</button></div> : <div className="attachment-unavailable" key={id}>相片已從相簿移除</div>)}</div>}
        <small className="notebook-hint">Ctrl / ⌘ + Enter 可快速新增</small>
      </section></div>}
      <div className="notebook-tools"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋記事…" aria-label="搜尋記事" /><div className="notebook-filters"><button className={filter === '全部' ? 'chosen' : ''} onClick={() => setFilter('全部')}>全部</button>{categories.map(item => <button key={item} className={filter === item ? 'chosen' : ''} onClick={() => setFilter(item)}>{item}</button>)}<div className="notebook-actions"><button className="notebook-add-button" type="button" onClick={openCompose}>＋ 新增</button><button className="notebook-camera-button" type="button" onClick={() => { openCompose(); onOpenCamera(photo => setPhotoIds(current => Array.from(new Set([...current, photo])))) }} aria-label="拍照"><span>▣</span> 拍照</button></div></div></div>
      <section className="notebook-list">{visible.map(entry => { const entryPhotoIds = entry.photoIds?.length ? entry.photoIds : entry.photoId ? [entry.photoId] : []; const sources = entryPhotoIds.map(id => resolveAttachmentPhoto(id, undefined, photoSources)).filter((source): source is string => Boolean(source)); return <div className="notebook-entry-swipe-shell" key={entry.id}><div className="notebook-entry-swipe-actions" aria-label="刪除記事"><button type="button" onClick={() => remove(entry.id)} aria-label="刪除記事">刪除</button></div><article className={`notebook-entry ${entry.done ? 'is-done' : ''} ${swipeEntryId === entry.id ? 'is-swiping' : ''}`} style={{ transform: swipeEntryId === entry.id ? `translateX(${swipeOffset}px)` : undefined }} onTouchStart={event => handleEntryTouchStart(event, entry.id)} onTouchMove={handleEntryTouchMove} onTouchEnd={handleEntryTouchEnd} onTouchCancel={resetEntrySwipe}><div className="notebook-entry-main"><button className="notebook-check" onClick={() => toggle(entry.id, 'done')} aria-label={entry.done ? '標記未完成' : '標記完成'}>{entry.done ? '✓' : '○'}</button><div><div className="notebook-entry-meta"><span>{entry.category}</span><time>{new Date(entry.createdAt).toLocaleString('zh-HK', { hour12: false })}</time></div><p>{entry.text}</p>{sources.length ? <div className="notebook-entry-photos">{sources.map((source, index) => <button type="button" className="notebook-entry-photo-button" key={`${entry.id}-${index}`} onClick={() => setPreviewPhoto(source)} aria-label={`放大記事相片 ${index + 1}`}><img className="notebook-entry-photo" src={source} alt={`記事相片 ${index + 1}`} /></button>)}</div> : entryPhotoIds.length ? <div className="attachment-unavailable">相片已從相簿移除</div> : null}</div></div><div className="notebook-entry-actions"><button onClick={() => toggle(entry.id, 'pinned')} aria-label={entry.pinned ? '取消置頂' : '置頂'}>{entry.pinned ? '★' : '☆'}</button><button onClick={() => editEntry(entry)} aria-label="編輯記事">✎</button><button onClick={() => remove(entry.id)} aria-label="刪除記事">×</button></div></article></div> })}{!visible.length && <div className="empty-state">尚未有記事<br /><small>在上方輸入現場事項即可快速建立</small></div>}</section>
      {previewPhoto && <div className="overlay dark-overlay" role="dialog" aria-modal="true" aria-label="記事相片預覽" onClick={() => setPreviewPhoto(null)}><div className="detail-modal" onClick={event => event.stopPropagation()}><button type="button" className="close light" onClick={() => setPreviewPhoto(null)} aria-label="關閉相片預覽">×</button><img src={previewPhoto} alt="記事相片預覽" /></div></div>}
    </main>{showNavigation && <BottomNav onNavigate={onNavigate} />}
  </div>
}
