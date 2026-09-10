'use client'

type Props = {
  projectName: string
  onProjectClick: () => void
}

export function StandaloneToolbar({ projectName, onProjectClick }: Props) {
  return (
    <header className="topbar standalone-topbar">
      <div className="brand-mark" aria-hidden="true">▦</div>
      <button className="project-trigger" type="button" onClick={onProjectClick} aria-label="返回並選擇 Project">
        <strong>{projectName}</strong><span>⌄</span>
      </button>
    </header>
  )
}

