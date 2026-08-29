export type MemoPhoto = { id: string; name: string; tag: string; time: string; customNote: string; previewUrl: string }
export type MemoPdfPage = { pageNumber: number; imageUrl: string }
export type MemoPdfAttachment = { id: string; title: string; fileName: string; dwgNo: string; size: string; dataUrl: string; pages: MemoPdfPage[]; totalPages: number; note: string }
export type MemoRecipient = { company: string; addressLines: string[]; attn: string; email: string }
export type MemoSender = {
  jvName: string; address: string; tel: string; fax: string; email: string
  contractNo: string; projectTitle: string; substationTitle: string; signerName: string; signerRole: string
}
export type MemoSpare = { title: string; delayDays: number; criticalPath: string; notes: string }

export type Memo = {
  id: string
  refNo: string
  date: string
  inspectionDate: string
  delivery: string
  recipient: MemoRecipient
  sender: MemoSender
  subject: string
  roughInput: string
  items: string[]
  legalClause: string
  photos: MemoPhoto[]
  pdfAttachments: MemoPdfAttachment[]
  spareModule: MemoSpare
  status: string
  signature: string | null
}

export type HistoryRecord = { recordId: string; savedAt: string; action: string; memo: Memo }

export const PHOTO_QUICK_TAGS = [
  '天台石屎座防水層未做',
  '外牆未完成批盪',
  '雨水乾濕井土建未完',
  '周界圍牆結構未完成',
  '阻礙纖維水缸送貨吊運',
  '阻礙外牆打喉碼/VG接駁',
  '尚未有正式交場日期',
  '現場積水及雜物阻塞通道',
  '結構鋼筋裸露未灌漿',
]

export function createDefaultMemo(): Memo {
  return {
    id: 'MEMO-1635-011',
    refNo: 'K77JVL011',
    date: '22 Aug 2026',
    inspectionDate: '2026年8月20日',
    delivery: 'BY Hand & Email',
    recipient: {
      company: 'China Road and Bridge Corporation',
      addressLines: ['38/F, Dorset House', "Taikoo Place, 979 King's Road", 'Quarry Bay, Hong Kong'],
      attn: 'Mr William Chan',
      email: 'william.chan@crbc.com.hk',
    },
    sender: {
      jvName: 'SOUTHA - QUAD-TECH Joint Venture',
      address: '7/F Paramount Building, 12 Ka Yip Street, Chai Wan, Hong Kong',
      tel: '(852) 2963 7299',
      fax: '(852) 2963 7142',
      email: 'sqjv1635@southa.com',
      contractNo: 'Contract No 1635',
      projectTitle: 'Northern Link, NOL Works Package 1',
      substationTitle: 'For CLP 132/11kV Temporary Substation at San Tam Road',
      signerName: 'Henry Chu',
      signerRole: 'Project Manager',
    },
    subject: '有關建築未完成位置阻礙水喉系統安裝',
    roughInput:
      '1. Block 1天台石屎座防水未做，上唔到水缸。\n2. Block 1 & 2 外牆未批盪，天台VG駁唔到。\n3. 雨水乾濕井未搞好，潛水泵進唔到場。\n4. 周界牆未完成，無得打喉碼。\n5. Block 1 外牆未批盪，駁唔到250L水缸。',
    items: [
      'Block 1天台地台及石屎座防水層仍未完成以致尚未有正式交場日期,阻礙安裝打喉碼,水喉及纖維水缸。此引致水缸未能安排送貨。',
      'Block1 & 2 外牆由於仍未完成批盪引致天台VG不能安裝接駁喉。',
      '雨水潛水泵乾濕井未成以致尚未有正式交場日期,此引致潛水泵未能安排送貨。',
      '周界牆位置尚未完成整幅牆身及批盪,阻礙安裝牆身水喉/喉碼。',
      'Block 1外牆仍未開始批盪,此位置阻礙安裝外牆水喉/喉碼以致接駁250L纖維水缸。',
    ],
    legalClause:
      '請貴司盡快完成上述工作,以免延誤相關機電安裝進度及其後的測試及調試工作,更會影響整交付時間。\n\n若因貴司或貴司之分判疏忽而導致任何索償、損失、工程延誤或其他後果,以及設備損壞所引致之維修或更換費用,本公司保留追究權利。',
    photos: [],
    pdfAttachments: [],
    spareModule: {
      title: '備用槽 (遲啲再加功能)',
      delayDays: 14,
      criticalPath: '水缸吊運與水泵通水調試',
      notes: '預留自訂擴充模組，現已內置工期延誤 (EOT) 預警評估。',
    },
    status: '待大判回覆交場',
    signature: null,
  }
}

const MEMO_DB = 'site-memo-db'
const MEMO_STORE = 'state'

function openMemoDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(MEMO_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(MEMO_STORE, { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function readMemoKey<T>(key: string): Promise<T | null> {
  return openMemoDb().then(
    db =>
      new Promise<T | null>((resolve, reject) => {
        const request = db.transaction(MEMO_STORE, 'readonly').objectStore(MEMO_STORE).get(key)
        request.onsuccess = () => resolve(request.result ? (request.result.value as T) : null)
        request.onerror = () => reject(request.error)
      }),
  )
}

function writeMemoKey(key: string, value: unknown) {
  return openMemoDb().then(
    db =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(MEMO_STORE, 'readwrite')
        transaction.objectStore(MEMO_STORE).put({ key, value })
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      }),
  )
}

export const loadMemo = () => readMemoKey<Memo>('current')
export const saveMemo = (memo: Memo) => writeMemoKey('current', memo)
export const loadHistory = () => readMemoKey<HistoryRecord[]>('history').then(records => records || [])
export const saveHistory = (records: HistoryRecord[]) => writeMemoKey('history', records)

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function nowStamp() {
  const d = new Date()
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Render a PDF file into an array of high-resolution PNG page images using pdfjs-dist.
export async function renderPdfToPages(dataUrl: string): Promise<MemoPdfPage[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  const base64 = dataUrl.split(',')[1] || ''
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const doc = await pdfjs.getDocument({ data: bytes }).promise
  const pages: MemoPdfPage[] = []
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const context = canvas.getContext('2d')
    if (!context) continue
    await page.render({ canvas, canvasContext: context, viewport } as any).promise
    pages.push({ pageNumber, imageUrl: canvas.toDataURL('image/png') })
  }
  return pages
}
