'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  const [quickMode, setQuickMode] = useState(false)
  const [pullToAddEnabled, setPullToAddEnabled] = useState(false)
  const [quickEntryId, setQuickEntryId] = useState<string | null>(null)
  const pullStartY = useRef<number | null>(null)
  const pullTriggered = useRef(false)
  const composeTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [saveError, setSaveError] = useState('')
  const loadedProjectRef = useRef<string | null>(null)

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
    setText(''); setPhotoIds([]); setShowCompose(false)
    setQuickEntryId(null)
  }
  const openCompose = () => { setText(''); setPhotoIds([]); setQuickEntryId(null); setShowCompose(true) }
  const closeCompose = () => { setText(''); setPhotoIds([]); setQuickEntryId(null); setShowCompose(false) }
  const handlePullStart = (event: React.TouchEvent<HTMLElement>) => {
    if (!isRegistered || !pullToAddEnabled || showCompose || event.currentTarget.scrollTop !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('button, input, textarea, select, a')) return
    pullStartY.current = event.touches[0]?.clientY ?? null
    pullTriggered.current = false
    setPullDistance(0)
  }
  const handlePullMove = (event: React.TouchEvent<HTMLElement>) => {
    if (!isRegistered || !pullToAddEnabled || pullStartY.current === null || pullTriggered.current || event.currentTarget.scrollTop !== 0) return
    const distance = Math.max(0, event.touches[0].clientY - pullStartY.current)
    setPullDistance(Math.min(88, distance * 0.55))
    if (distance < 60) return
    pullTriggered.current = true
    event.preventDefault()
    setPullDistance(88)
  }
  const handlePullEnd = () => {
    const triggered = pullTriggered.current
    pullStartY.current = null
    pullTriggered.current = false
    setPullDistance(0)
    if (!triggered) return
    flushSync(() => openCompose())
    composeTextareaRef.current?.focus({ preventScroll: true })
  }
  const handlePullCancel = () => { pullStartY.current = null; pullTriggered.current = false; setPullDistance(0) }
  const saveQuickEntry = (value: string, attachmentIds: string[]) => {
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
  useLayoutEffect(() => {
    if (!showCompose) return
    composeTextareaRef.current?.focus({ preventScroll: true })
    const frame = requestAnimationFrame(() => composeTextareaRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [showCompose])
  const toggle = (id: string, field: 'done' | 'pinned') => setEntries(current => current.map(entry => entry.id === id ? { ...entry, [field]: !entry[field] } : entry))
  const remove = (id: string) => { if (confirm('確定刪除此記事？')) setEntries(current => current.filter(entry => entry.id !== id)) }
  const visible = useMemo(() => entries.filter(entry => filter === '全部' || entry.category === filter).filter(entry => !query.trim() || entry.text.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [entries, filter, query])
  const pendingPhotos = photoIds.map(id => resolveAttachmentPhoto(id, undefined, photoSources)).filter((photo): photo is string => Boolean(photo))

  return <div className="app-shell notebook-app">
    <StandaloneToolbar projectName={projectName} onProjectClick={onBack} />
    <main className="notebook-body" onTouchStart={handlePullStart} onTouchMove={handlePullMove} onTouchEnd={handlePullEnd} onTouchCancel={handlePullCancel}>
      <div className="section-heading"><div><p className="eyebrow">SITE NOTEBOOK</p><h2>記事簿</h2></div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><button type="button" disabled={!isRegistered} onClick={() => setQuickMode(current => !current)} aria-label="開／關快速記事保存功能；輸入後按鍵盤傳送或換行鍵保存" aria-pressed={quickMode} title={isRegistered ? '開／關快速記事保存功能' : '註冊版專有功能'} style={{ display: 'grid', placeItems: 'center', width: 42, height: 42, padding: 0, border: '1px solid var(--orange)', borderRadius: 8, background: quickMode ? 'var(--orange)' : '#fff', color: quickMode ? '#fff' : 'var(--navy)', opacity: isRegistered ? 1 : .5 }}><Send size={19} aria-hidden="true" /></button><button type="button" disabled={!isRegistered} onClick={() => setPullToAddEnabled(current => !current)} aria-label="開／關下拉新增記事功能" title={isRegistered ? '開／關下拉新增記事' : '註冊版專有功能'} aria-pressed={pullToAddEnabled} style={{ display: 'grid', placeItems: 'center', width: 42, height: 42, padding: 0, border: '1px solid var(--line)', borderRadius: 8, background: pullToAddEnabled ? 'var(--blue)' : '#fff', color: pullToAddEnabled ? '#fff' : 'var(--navy)', opacity: isRegistered ? 1 : .5 }}><Zap size={22} aria-hidden="true" /></button>{!showNavigation && onOpenSettings && <button type="button" onClick={onOpenSettings} aria-label="設定" title="設定" style={{ display: 'grid', placeItems: 'center', width: 42, height: 42, padding: 0, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', color: 'var(--foreground)' }}><Settings2 size={20} aria-hidden="true" /></button>}</div></div>
      {saveError && <div className="save-toast error" role="alert">{saveError}</div>}
      {pullDistance > 0 && <div className="notebook-pull-indicator" style={{ height: pullDistance, opacity: Math.min(1, pullDistance / 48) }} aria-hidden="true"><span>{pullDistance >= 40 ? '放開以新增記事' : '下拉新增記事'}</span></div>}
      {showCompose && <div className="notebook-modal-backdrop" onClick={closeCompose}><section className="notebook-compose notebook-modal notebook-modal-enter" onClick={event => event.stopPropagation()}>
        <div className="notebook-modal-heading"><h2>新增記事</h2><button type="button" onClick={closeCompose}>×</button></div>
        <textarea ref={element => { composeTextareaRef.current = element; if (element) element.focus({ preventScroll: true }) }} autoFocus value={text} onChange={event => handleTextChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && quickMode && !event.shiftKey) { event.preventDefault(); finishQuickEntry() } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !quickMode) addEntry() }} placeholder="快速記錄現場事項…" aria-label="記事內容" />
        <div className="notebook-compose-row"><div className="notebook-compose-tools"><div className="notebook-category-quick-select" role="group" aria-label="記事分類快選">{categories.map(item => <button type="button" key={item} className={category === item ? 'chosen' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="notebook-media-actions"><button type="button" onClick={() => onSelectAlbumPhotos(ids => { const next = Array.from(new Set([...photoIds, ...ids])); setPhotoIds(next); saveQuickEntry(text, next) })}>📎 相簿</button><button type="button" onClick={() => onOpenCamera(photo => { const next = Array.from(new Set([...photoIds, photo])); setPhotoIds(next); saveQuickEntry(text, next) })}>▣ 拍攝</button></div></div>{quickMode ? <span style={{ color: 'var(--blue)', fontSize: 12, fontWeight: 700 }}>輸入即自動保存</span> : <button className="primary-button" type="button" onClick={addEntry}>新增記事</button>}</div>
        {!!photoIds.length && <div className="notebook-photo-preview">{photoIds.map((id, index) => pendingPhotos[index] ? <div className="notebook-photo-item" key={id}><img src={pendingPhotos[index]} alt={`待附加相片 ${index + 1}`} /><button type="button" onClick={() => setPhotoIds(current => current.filter(value => value !== id))}>移除</button></div> : <div className="attachment-unavailable" key={id}>相片已從相簿移除</div>)}</div>}
        <small className="notebook-hint">Ctrl / ⌘ + Enter 可快速新增</small>
      </section></div>}
      <div className="notebook-tools"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋記事…" aria-label="搜尋記事" /><div className="notebook-filters"><button className={filter === '全部' ? 'chosen' : ''} onClick={() => setFilter('全部')}>全部</button>{categories.map(item => <button key={item} className={filter === item ? 'chosen' : ''} onClick={() => setFilter(item)}>{item}</button>)}<div className="notebook-actions"><button className="notebook-add-button" type="button" onClick={openCompose}>＋ 新增</button><button className="notebook-camera-button" type="button" onClick={() => { openCompose(); onOpenCamera(photo => setPhotoIds(current => Array.from(new Set([...current, photo])))) }} aria-label="拍照"><span>▣</span> 拍照</button></div></div></div>
      <section className="notebook-list">{visible.map(entry => { const entryPhotoIds = entry.photoIds?.length ? entry.photoIds : entry.photoId ? [entry.photoId] : []; const sources = entryPhotoIds.map(id => resolveAttachmentPhoto(id, undefined, photoSources)).filter((source): source is string => Boolean(source)); return <article className={`notebook-entry ${entry.done ? 'is-done' : ''}`} key={entry.id}><div className="notebook-entry-main"><button className="notebook-check" onClick={() => toggle(entry.id, 'done')} aria-label={entry.done ? '標記未完成' : '標記完成'}>{entry.done ? '✓' : '○'}</button><div><div className="notebook-entry-meta"><span>{entry.category}</span><time>{new Date(entry.createdAt).toLocaleString('zh-HK', { hour12: false })}</time></div><p>{entry.text}</p>{sources.length ? <div className="notebook-entry-photos">{sources.map((source, index) => <button type="button" className="notebook-entry-photo-button" key={`${entry.id}-${index}`} onClick={() => setPreviewPhoto(source)} aria-label={`放大記事相片 ${index + 1}`}><img className="notebook-entry-photo" src={source} alt={`記事相片 ${index + 1}`} /></button>)}</div> : entryPhotoIds.length ? <div className="attachment-unavailable">相片已從相簿移除</div> : null}</div></div><div className="notebook-entry-actions"><button onClick={() => toggle(entry.id, 'pinned')} aria-label={entry.pinned ? '取消置頂' : '置頂'}>{entry.pinned ? '★' : '☆'}</button><button onClick={() => remove(entry.id)} aria-label="刪除記事">×</button></div></article> })}{!visible.length && <div className="empty-state">尚未有記事<br /><small>在上方輸入現場事項即可快速建立</small></div>}</section>
      {previewPhoto && <div className="overlay dark-overlay" role="dialog" aria-modal="true" aria-label="記事相片預覽" onClick={() => setPreviewPhoto(null)}><div className="detail-modal" onClick={event => event.stopPropagation()}><button type="button" className="close light" onClick={() => setPreviewPhoto(null)} aria-label="關閉相片預覽">×</button><img src={previewPhoto} alt="記事相片預覽" /></div></div>}
    </main>{showNavigation && <BottomNav onNavigate={onNavigate} />}
  </div>
}
