'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Photo = { id: string; src: string; cleanSrc: string; category: string; tags: Record<string, string>; note: string; createdAt: string }
type Category = { name: string; icon: string }

const defaultCategories: Category[] = [
  { name: '鋼筋工程', icon: '▦' },
  { name: '模板工程', icon: '▤' },
  { name: '混凝土澆置', icon: '◈' },
  { name: '機電工程', icon: '⌁' },
  { name: '安全巡查', icon: '△' },
]
const tagOptions: Record<string, string[]> = {
  樓層: ['B2', 'B1', 'G/F', '1/F', '2/F', '3/F', '天台'],
  機房: ['A區機房', 'B區機房', '泵房', '電房', '消防泵房'],
  事項: ['施工進度', '品質檢查', '材料驗收', '工序記錄', '完成確認'],
  安全: ['個人防護', '臨邊防護', '開口防護', '消防設備', '安全通道'],
  其它: ['日常巡查', '材料到場', '環境記錄', '問題跟進'],
}

const PHOTO_DB = 'site-photo-db'
const PHOTO_STORE = 'photos'

function openPhotoDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(PHOTO_STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function loadStoredPhotos() {
  return openPhotoDb().then(db => new Promise<Photo[]>((resolve, reject) => {
    const request = db.transaction(PHOTO_STORE, 'readonly').objectStore(PHOTO_STORE).getAll()
    request.onsuccess = () => resolve(request.result as Photo[])
    request.onerror = () => reject(request.error)
  }))
}

function saveStoredPhotos(photos: Photo[]) {
  return openPhotoDb().then(db => new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(PHOTO_STORE, 'readwrite')
    const store = transaction.objectStore(PHOTO_STORE)
    store.clear()
    photos.forEach(photo => store.put(photo))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  }))
}

function stampImage(file: File, category: string) {
  return new Promise<{ stamped: string; clean: string }>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = image.width; canvas.height = image.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(image, 0, 0)
        const text = `${category} | ${new Date().toLocaleString('zh-HK', { hour12: false })}`
        const size = Math.max(18, Math.round(image.width / 48))
        ctx.font = `600 ${size}px Arial, sans-serif`
        const width = ctx.measureText(text).width + size * 1.4
        const height = size * 2.1
        ctx.fillStyle = 'rgba(10, 17, 24, .72)'; ctx.fillRect(image.width - width, image.height - height, width, height)
        ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, image.width - width + size * .7, image.height - height / 2)
        resolve({ stamped: canvas.toDataURL('image/jpeg', .88), clean: reader.result as string })
      }
      image.onerror = () => reject(new Error('無法讀取相片'))
      image.src = reader.result as string
    }
    reader.onerror = () => reject(reader.error || new Error('無法讀取檔案'))
    reader.readAsDataURL(file)
  })
}

export default function Page() {
  const [categories, setCategories] = useState(defaultCategories)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [tab, setTab] = useState<'home' | 'photos'>('home')
  const [tags, setTags] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [picker, setPicker] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [detail, setDetail] = useState<Photo | null>(null)
  const [newCategory, setNewCategory] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null); const albumRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadStoredPhotos().then(setPhotos).catch(() => setPhotos([]))
    try {
      localStorage.removeItem('site-photo-records')
      const memory = localStorage.getItem('site-photo-memory')
      if (memory) { const m = JSON.parse(memory); setTags(m.tags || {}); setNote(m.note || '') }
    } catch { /* 儲存空間不可用時仍可繼續拍攝 */ }
  }, [])
  useEffect(() => {
    if (photos.length) saveStoredPhotos(photos).catch(() => alert('相片儲存失敗，請檢查瀏覽器儲存空間'))
  }, [photos])
  useEffect(() => {
    try { localStorage.setItem('site-photo-memory', JSON.stringify({ tags, note })) } catch { /* 備註記憶不可用不影響相片 */ }
  }, [tags, note])

  const currentPhotos = useMemo(() => active ? photos.filter(p => p.category === active) : photos, [active, photos])
  const importFiles = async (files: FileList | null) => {
    if (!files || !active) return
    const added = await Promise.all(Array.from(files).map(async file => { const result = await stampImage(file, active); return { id: crypto.randomUUID(), src: result.stamped, cleanSrc: result.clean, category: active, tags, note, createdAt: new Date().toISOString() } }))
    setPhotos(p => [...added, ...p]); setTab('photos')
  }
  const addCategory = (name: string) => { if (name.trim()) setCategories(c => [...c, { name: name.trim(), icon: '＋' }]); setNewCategory(false) }
  const removeCategory = (name: string) => { if (confirm(`確定刪除「${name}」及其相片？`)) { setCategories(c => c.filter(x => x.name !== name)); setPhotos(p => p.filter(x => x.category !== name)) } }
  const exportExcel = async () => {
    const chosen = photos.filter(x => selected.includes(x.id))
    if (!chosen.length) return alert('請先勾選要匯出的相片')
    const XLSX = (window as any).ExcelJS
    if (!XLSX) return alert('Excel 模組尚未載入，請重新整理頁面後再試')
    try {
      const book = new XLSX.Workbook()
      const sheet = book.addWorksheet('相片記錄')
      sheet.columns = [{ header: '相片', key: 'photo', width: 28 }, { header: '類別', key: 'category', width: 18 }, { header: '標籤', key: 'tags', width: 42 }, { header: '備註', key: 'note', width: 32 }, { header: '拍攝時間', key: 'time', width: 22 }]
      for (const p of chosen) {
        const row = sheet.addRow({ category: p.category, tags: Object.entries(p.tags).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' / '), note: p.note, time: new Date(p.createdAt).toLocaleString('zh-HK') })
        const cleanBase64 = p.cleanSrc.includes(',') ? p.cleanSrc.split(',')[1] : p.cleanSrc
        const imageId = book.addImage({ base64: cleanBase64, extension: 'jpeg' })
        sheet.addImage(imageId, { tl: { col: 0, row: row.number - 1 }, ext: { width: 165, height: 165 } })
        row.height = 130
      }
      const buffer = await book.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a'); a.href = url; a.download = '地盤相片記錄.xlsx'; document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { console.error('[v0] Excel export failed:', error); alert('Excel 匯出失敗，請稍後再試') }
  }
  const exportPdf = async () => {
    const chosen = photos.filter(x => selected.includes(x.id)); const pdf = (window as any).html2pdf
    if (!chosen.length) return alert('請先勾選要匯出的相片')
    if (!pdf) return alert('PDF 模組尚未載入，請重新整理頁面後再試')
    const report = document.createElement('div')
    report.style.cssText = 'position:fixed;left:-10000px;top:0;width:1120px;min-height:500px;background:#fff;color:#15212b;padding:24px;z-index:1;'
    report.innerHTML = `<h1 style="font-size:22px;margin:0 0 18px">地盤相片記錄報表</h1>` + chosen.map(p => `<article style="display:flex;gap:14px;border-top:1px solid #d8e0e5;padding:14px 0;break-inside:avoid"><img src="${p.src}" style="width:165px;height:125px;object-fit:cover"/><div><b>${p.category}</b><p>${Object.entries(p.tags).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(' / ') || '未設定標籤'}</p><p>${p.note || ''}</p><small>${new Date(p.createdAt).toLocaleString('zh-HK')}</small></div></article>`).join('')
    document.body.appendChild(report)
    await Promise.all(Array.from(report.querySelectorAll('img')).map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => { img.onload = () => resolve(); img.onerror = () => resolve() })))
    try { await pdf().set({ margin: 12, filename: '地盤相片報表.pdf', html2canvas: { scale: 1.5, useCORS: true, backgroundColor: '#ffffff', logging: false }, jsPDF: { unit: 'mm', format: 'a3', orientation: 'landscape' } }).from(report).save() }
    catch (error) { console.error('[v0] PDF export failed:', error); alert('PDF 匯出失敗，請稍後再試') }
    finally { report.remove() }
  }

  return <>
    <script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js" />
    <main className="app-shell">
      <header className="topbar"><div className="brand-mark">▦</div><div><p className="eyebrow">SITE LOG / 2026</p><h1>地盤相片記錄</h1></div><button className="icon-button" onClick={() => setNewCategory(true)} aria-label="新增類別">＋</button></header>
      {tab === 'home' && !active && <section className="content"><div className="section-heading"><div><p className="eyebrow">PROJECT ARCHIVE</p><h2>工程類別</h2></div><span className="photo-total">{photos.length} 張相片</span></div><div className="category-grid">{categories.map(c => <button key={c.name} className="category-card" onClick={() => setActive(c.name)} onContextMenu={e => { e.preventDefault(); removeCategory(c.name) }}><span className="category-icon">{c.icon}</span><strong>{c.name}</strong><span>{photos.filter(p => p.category === c.name).length} 張記錄</span></button>)}<button className="category-card add-card" onClick={() => setNewCategory(true)}><span className="category-icon">＋</span><strong>新增類別</strong><span>自訂工程分類</span></button></div><div className="hint">長按類別卡片可刪除分類</div></section>}
      {active && <section className="content"><button className="back-link" onClick={() => setActive(null)}>‹ 所有類別</button><div className="section-heading"><div><p className="eyebrow">CURRENT CATEGORY</p><h2>{active}</h2></div><span className="photo-total">{currentPhotos.length} 張</span></div><div className="capture-actions"><button className="capture-button camera" onClick={() => cameraRef.current?.click()}><span>▣</span><div><strong>立即拍照</strong><small>拍攝後自動儲存</small></div></button><button className="capture-button album" onClick={() => albumRef.current?.click()}><span>▧</span><div><strong>選擇相簿</strong><small>可一次匯入多張</small></div></button><input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={e => importFiles(e.target.files)} /><input ref={albumRef} hidden type="file" accept="image/*" multiple onChange={e => importFiles(e.target.files)} /></div><div className="tag-panel"><div className="section-heading compact"><div><p className="eyebrow">SMART TAGS</p><h3>拍攝資訊</h3></div><span className="memory-dot">● 已記憶</span></div><div className="tag-grid">{['樓層', '機房', '事項', '安全', '其它', '備註'].map(label => <button className={`tag-chip ${tags[label] ? 'chosen' : ''}`} key={label} onClick={() => setPicker(label)}><span>{label}</span><b>{tags[label] || '選擇'}</b></button>)}</div><label className="note-field"><span>文字備註</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="輸入本次拍攝的補充說明..." /></label></div></section>}
      {tab === 'photos' && <section className="content"><div className="section-heading"><div><p className="eyebrow">PHOTO ARCHIVE</p><h2>相片集</h2></div><span className="photo-total">已選 {selected.length} 張</span></div><div className="photo-grid">{photos.map(p => <div className="photo-card" key={p.id}><button className="photo-open" onClick={() => setDetail(p)}><img src={p.src} alt={`${p.category} ${p.createdAt}`} /></button><label className="check"><input type="checkbox" checked={selected.includes(p.id)} onChange={e => setSelected(s => e.target.checked ? [...s, p.id] : s.filter(id => id !== p.id))} /><span /></label></div>)}{!photos.length && <div className="empty-state">尚未有相片記錄<br /><small>進入工程類別開始拍攝</small></div>}</div><div className="export-bar"><span>{selected.length ? `已選 ${selected.length} 張` : '請先勾選相片'}</span><button disabled={!selected.length} onClick={exportExcel}>匯出 Excel</button><button disabled={!selected.length} onClick={exportPdf}>匯出 A3 PDF</button></div><div id="pdf-report" className="pdf-report"><h1>地盤相片記錄報表</h1>{photos.filter(p => selected.includes(p.id)).map(p => <article key={p.id}><img src={p.src} alt="" /><div><b>{p.category}</b><p>{Object.entries(p.tags).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(' / ')}</p><p>{p.note}</p><small>{new Date(p.createdAt).toLocaleString('zh-HK')}</small></div></article>)}</div></section>}
      <nav className="bottom-nav"><button className={tab === 'home' ? 'active' : ''} onClick={() => { setTab('home'); setActive(null) }}><span>⌂</span>工程類別</button><button className={tab === 'photos' ? 'active' : ''} onClick={() => { setTab('photos'); setActive(null) }}><span>▧</span>相片集<em>{photos.length}</em></button></nav>
    </main>
    {picker && <div className="overlay" onClick={() => setPicker(null)}><div className="sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div className="section-heading compact"><div><p className="eyebrow">SELECT OPTION</p><h3>{picker}</h3></div><button className="close" onClick={() => setPicker(null)}>×</button></div>{(tagOptions[picker] || []).map(option => <button className="option" key={option} onClick={() => { setTags(t => ({ ...t, [picker]: option })); setPicker(null) }}>{option}<span>{tags[picker] === option ? '✓' : '›'}</span></button>)}<div className="custom-option"><input id="custom" placeholder="新增自訂項目" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && e.currentTarget.value.trim()) { setTags(t => ({ ...t, [picker]: e.currentTarget.value.trim() })); setPicker(null) } }} /><button onClick={() => { const input = document.getElementById('custom') as HTMLInputElement; if (input.value.trim()) { setTags(t => ({ ...t, [picker]: input.value.trim() })); setPicker(null) } }}>新增</button></div></div></div>}
    {detail && <div className="overlay dark-overlay" onClick={() => setDetail(null)}><div className="detail-modal" onClick={e => e.stopPropagation()}><button className="close light" onClick={() => setDetail(null)}>×</button><img src={detail.src} alt="相片詳情" /><div className="detail-copy"><b>{detail.category}</b><p>{Object.entries(detail.tags).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(' / ') || '未設定標籤'}</p><p>{detail.note || '沒有備註'}</p><small>{new Date(detail.createdAt).toLocaleString('zh-HK')}</small></div></div></div>}
    {newCategory && <div className="overlay" onClick={() => setNewCategory(false)}><div className="sheet small-sheet" onClick={e => e.stopPropagation()}><div className="section-heading compact"><div><p className="eyebrow">NEW CATEGORY</p><h3>新增工程類別</h3></div><button className="close" onClick={() => setNewCategory(false)}>×</button></div><input className="category-input" autoFocus placeholder="例如：外牆工程" onKeyDown={e => { if (e.key === 'Enter') addCategory(e.currentTarget.value) }} /><button className="primary-button" onClick={() => addCategory((document.querySelector('.category-input') as HTMLInputElement).value)}>建立類別</button></div></div>}
  </>
}
