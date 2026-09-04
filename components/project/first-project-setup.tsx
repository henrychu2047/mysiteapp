'use client'

import { ROOM_NAME_SUGGESTIONS } from '@/components/handover/handover-data'

type FirstProjectSetupProps = {
  projectName: string
  towers: string
  towerPrefix: string
  floors: string
  floorPrefix: string
  floorSuffix: string
  compactFloors: boolean
  rooms: string
  roomSuffixStart: string
  roomSuffixEnd: string
  onProjectNameChange: (value: string) => void
  onTowersChange: (value: string) => void
  onTowerPrefixChange: (value: string) => void
  onFloorsChange: (value: string) => void
  onFloorPrefixChange: (value: string) => void
  onFloorSuffixChange: (value: string) => void
  onCompactFloorsChange: (value: boolean) => void
  onRoomsChange: (value: string) => void
  onRoomSuffixStartChange: (value: string) => void
  onRoomSuffixEndChange: (value: string) => void
  onComplete: () => void
}

export function FirstProjectSetup({ projectName, towers, towerPrefix, floors, floorPrefix, floorSuffix, compactFloors, rooms, roomSuffixStart, roomSuffixEnd, onProjectNameChange, onTowersChange, onTowerPrefixChange, onFloorsChange, onFloorPrefixChange, onFloorSuffixChange, onCompactFloorsChange, onRoomsChange, onRoomSuffixStartChange, onRoomSuffixEndChange, onComplete }: FirstProjectSetupProps) {
  const roomNames = rooms.split(/[,，\n]/).map(value => value.trim()).filter(Boolean)

  return <div className="overlay" role="dialog" aria-modal="true">
    <div className="sheet first-launch-sheet">
      <div className="sheet-header"><div><p className="eyebrow">FIRST PROJECT SETUP</p><h2>建立第一個 Project</h2></div></div>
      <p className="settings-intro">首次使用請輸入 Project 名稱，以及目前批量產生的座數／樓層／機房資料。</p>
      <label className="ho-field"><span>Project 名稱</span><input autoFocus value={projectName} onChange={event => onProjectNameChange(event.target.value)} placeholder="例如：Tower A 工程" /></label>
      <div className="setup-grid">
        <label className="ho-field"><span>座數</span><input type="number" min="1" value={towers} onChange={event => onTowersChange(event.target.value)} /></label>
        <label className="ho-field"><span>座數前綴</span><input value={towerPrefix} onChange={event => onTowerPrefixChange(event.target.value)} placeholder="例如：座" /></label>
        <label className="ho-field"><span>樓層數</span><input type="number" min="1" value={floors} onChange={event => onFloorsChange(event.target.value)} /></label>
        <label className="ho-field"><span>樓層前綴</span><input value={floorPrefix} onChange={event => onFloorPrefixChange(event.target.value)} placeholder="例如：L" /></label>
        <label className="ho-field"><span>樓層後綴</span><input value={floorSuffix} onChange={event => onFloorSuffixChange(event.target.value)} placeholder="例如：/F" /></label>
      </div>
      <label className="check-row"><input type="checkbox" checked={compactFloors} onChange={event => onCompactFloorsChange(event.target.checked)} /><span>樓層使用兩位數編號（L00、L01…）</span></label>
      <label className="ho-field"><span>機房名稱</span><textarea rows={3} value={rooms} onChange={event => onRoomsChange(event.target.value)} placeholder="可輸入自訂名稱，每行一個" /></label>
      <div className="ho-suggest-list">{ROOM_NAME_SUGGESTIONS.map(name => {
        const selected = roomNames.includes(name)
        return <button type="button" key={name} className={`ho-suggest ${selected ? 'on' : ''}`} onClick={() => onRoomsChange((selected ? roomNames.filter(value => value !== name) : [...roomNames, name]).join(', '))}>{selected && '✓ '}{name}</button>
      })}</div>
      <div className="setup-grid">
        <label className="ho-field"><span>機房後綴開始</span><input value={roomSuffixStart} onChange={event => onRoomSuffixStartChange(event.target.value)} placeholder="例如：1 或 N1" /></label>
        <label className="ho-field"><span>機房後綴完結</span><input value={roomSuffixEnd} onChange={event => onRoomSuffixEndChange(event.target.value)} placeholder="例如：4 或 N4" /></label>
      </div>
      <button className="primary-button" disabled={!projectName.trim()} onClick={onComplete}>建立 Project 並開始使用</button>
    </div>
  </div>
}
