/** Product composition shared by every Web App and future native clients. */

export type AppId = 'camera' | 'site-memo' | 'handover' | 'notebook' | 'database' | 'full'

export type FeatureModuleId =
  | 'camera-album'
  | 'project-management'
  | 'google-drive-backup'
  | 'site-memo'
  | 'handover'
  | 'notebook'
  | 'database'
  | 'team'

export type AppShellId = 'camera-capture' | 'standalone-toolbar' | 'full-navigation'

export type AppManifest = {
  id: AppId
  modules: readonly FeatureModuleId[]
  shell: AppShellId
  supportsTeam: boolean
}

const sharedModules = ['project-management', 'google-drive-backup'] as const

export const APP_MANIFESTS: Readonly<Record<AppId, AppManifest>> = {
  camera: { id: 'camera', modules: ['camera-album', ...sharedModules], shell: 'camera-capture', supportsTeam: false },
  'site-memo': { id: 'site-memo', modules: ['site-memo', 'camera-album', ...sharedModules], shell: 'standalone-toolbar', supportsTeam: false },
  handover: { id: 'handover', modules: ['handover', 'camera-album', ...sharedModules], shell: 'standalone-toolbar', supportsTeam: false },
  notebook: { id: 'notebook', modules: ['notebook', 'camera-album', ...sharedModules], shell: 'standalone-toolbar', supportsTeam: false },
  database: { id: 'database', modules: ['database', ...sharedModules], shell: 'standalone-toolbar', supportsTeam: false },
  full: { id: 'full', modules: ['camera-album', 'site-memo', 'handover', 'notebook', 'database', ...sharedModules, 'team'], shell: 'full-navigation', supportsTeam: true },
}

const APP_IDS = new Set<AppId>(Object.keys(APP_MANIFESTS) as AppId[])

export function getConfiguredAppId(): AppId {
  const configured = process.env.NEXT_PUBLIC_APP_ID as AppId | undefined
  return configured && APP_IDS.has(configured) ? configured : 'full'
}

