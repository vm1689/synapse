import { ReactNode } from 'react'
import './Panel.css'

interface PanelProps {
  panelName: string
  flex: number
  isCollapsed: boolean
  onToggle: () => void
  children: ReactNode
  headerActions?: ReactNode
  titleSuffix?: ReactNode
}

function Panel({ panelName, flex, isCollapsed, onToggle, children, headerActions, titleSuffix }: PanelProps) {
  const displayName = panelName.replace(/\b\w/g, char => char.toUpperCase())

  return (
    <div
      className={`panel ${isCollapsed ? 'collapsed' : ''}`}
      style={{ flex: isCollapsed ? '0 0 40px' : flex }}
    >
      <div className="panel-header">
        <span className="panel-title">
          {displayName}
          {titleSuffix}
        </span>
        <div className="panel-header-actions">
          {headerActions}
          <button className="collapse-btn" onClick={onToggle}>
            {isCollapsed ? '▶' : '◀'}
          </button>
        </div>
      </div>
      {!isCollapsed && <div className="panel-content">{children}</div>}
    </div>
  )
}

export default Panel

