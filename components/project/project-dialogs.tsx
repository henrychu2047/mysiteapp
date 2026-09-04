'use client'

import type { Project } from '@/lib/project-settings'

type ProjectPickerProps = {
  projects: Project[]
  currentProjectId: string
  newProjectName: string
  onNewProjectNameChange: (name: string) => void
  onClose: () => void
  onSelect: (project: Project) => void
  onRename: (project: Project) => void
  onAdd: () => void
  getPhotoCount: (projectId: string) => number
}

export function ProjectPicker({ projects, currentProjectId, newProjectName, onNewProjectNameChange, onClose, onSelect, onRename, onAdd, getPhotoCount }: ProjectPickerProps) {
  return <div className="overlay" onClick={onClose}>
    <div className="sheet project-sheet" onClick={event => event.stopPropagation()}>
      <div className="section-heading compact"><div><p className="eyebrow">PROJECTS</p><h3>選擇 Project</h3></div><button className="close" onClick={onClose} aria-label="關閉">×</button></div>
      {projects.map(project => <button className={`option ${project.id === currentProjectId ? 'chosen' : ''}`} key={project.id} onClick={() => onSelect(project)}>
        <span>{project.name}<small>{getPhotoCount(project.id)} 張相片</small></span><b>{project.id === currentProjectId ? '✓' : '›'}</b>
        <span className="project-row-rename" onClick={event => { event.stopPropagation(); onRename(project) }}>改名</span>
      </button>)}
      <div className="project-add"><input value={newProjectName} onChange={event => onNewProjectNameChange(event.target.value)} placeholder="輸入新 Project 名稱" onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) onAdd() }} /><button onClick={onAdd}>新增</button></div>
    </div>
  </div>
}

type RenameProjectDialogProps = {
  name: string
  onNameChange: (name: string) => void
  onClose: () => void
  onSave: () => void
}

export function RenameProjectDialog({ name, onNameChange, onClose, onSave }: RenameProjectDialogProps) {
  return <div className="overlay" role="dialog" aria-modal="true" onClick={onClose}>
    <div className="sheet small-sheet" onClick={event => event.stopPropagation()}>
      <div className="section-heading compact"><div><p className="eyebrow">RENAME PROJECT</p><h3>重新命名 Project</h3></div><button className="close" onClick={onClose} aria-label="關閉">×</button></div>
      <label className="ho-field"><span>Project 名稱</span><input autoFocus value={name} onChange={event => onNameChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) onSave() }} /></label>
      <button className="primary-button" disabled={!name.trim()} onClick={onSave}>保存名稱</button>
    </div>
  </div>
}
