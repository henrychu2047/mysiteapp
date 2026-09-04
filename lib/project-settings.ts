export type Category = { name: string; icon: string }

export type ProjectSettings = {
  categories: Category[]
  tags: Record<string, string>
  note: string
  settingsOptions: Record<string, string[]>
  noteHistory: string[]
  visibleTags: string[]
}

export type Project = { id: string; name: string; settings?: ProjectSettings }

export const DEFAULT_PROJECT: Project = { id: 'default-project', name: '我的 Project' }
export const PROJECTS_KEY = 'site-photo-projects'
export const CURRENT_PROJECT_KEY = 'site-photo-current-project'

export const defaultCategories: Category[] = [
  { name: '電器', icon: '⌁' },
  { name: '冷氣', icon: '◇' },
  { name: '消防', icon: '△' },
  { name: '安全', icon: '◈' },
  { name: '制櫃/發電機', icon: '▤' },
  { name: '建築', icon: '▥' },
  { name: '物料', icon: '▦' },
  { name: '機房移交', icon: '☑' },
]

export const normalizeCategoryName = (name: string) => {
  if (name === '發電機') return '安全'
  if (name === '制櫃') return '制櫃/發電機'
  return name
}

export const ensureDefaultCategories = (categories: Category[] | undefined) => {
  const existing = (categories || [])
    .filter(category => category.name !== '建築物料')
    .map(category => ({ ...category, name: normalizeCategoryName(category.name) }))
    .filter((category, index, all) => all.findIndex(item => item.name === category.name) === index)

  return [...existing, ...defaultCategories.filter(category => !existing.some(item => item.name === category.name))]
}

export const tagOptions: Record<string, string[]> = {
  樓層: ['B02', 'B01', 'L00', 'L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15', 'L16', 'L17', 'L18', 'L19', 'MR/F', 'UR1/F', 'UR2/F'],
  位置: ['電制房', '總制房', '發電機房', 'AHU房', 'ELV房', 'TR房'],
  事項: ['Defect', '未做喉', '未做糟', '未補明喉', '未穿線', '未裝燈', '未裝膠器', '未起鐵架', '未封板', '未開吼', '未塞吼', '未裝門', '進度慢', '被破壞', '受其它行頭阻礙', '受建築阻礙', '建築漏水', '其它行頭無跟CSD做'],
  安全: ['無圍欄', '不正規高空工作', '無安全帶', '無帶安全帽', '無安全繩', '地坑無鐵板', '吸煙'],
  收貨相關: ['已收待驗', '已入貨倉', '已交判頭', '來貨有問題', '來貨破爛'],
  座數: [],
}

export const mergeTagOptions = (saved?: Record<string, string[]>) => Object.fromEntries(
  Object.entries(tagOptions).map(([key, defaults]) => [
    key,
    saved && Object.prototype.hasOwnProperty.call(saved, key) ? [...new Set(saved[key] || [])] : [...defaults],
  ]),
)

export const SMART_TAG_KEYS = ['座數', '樓層', '位置', '安全', '收貨相關', '事項']

export const createProjectSettings = (): ProjectSettings => ({
  categories: defaultCategories,
  tags: {},
  note: '',
  settingsOptions: tagOptions,
  noteHistory: [],
  visibleTags: [...SMART_TAG_KEYS],
})
