import './Header.css'
import { resetPlanToDefault } from '../store/planStore'

function Header() {
  const handleReset = async () => {
    if (confirm('Reset to default? All changes will be lost.')) {
      await resetPlanToDefault()
    }
  }

  return (
    <div className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-logo">
          <img src="/synapse.jpeg" alt="Synapse Logo" className="synapse-logo" />
        </div>
        
        <div className="sidebar-actions">
          <button className="sidebar-action-btn" onClick={handleReset} title="Reset plan to default">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3.333 10C3.333 6.318 6.318 3.333 10 3.333C11.667 3.333 13.167 4 14.167 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5.833 3.333L3.333 5.833L5.833 8.333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16.667 10C16.667 13.682 13.682 16.667 10 16.667C8.333 16.667 6.833 16 5.833 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14.167 16.667L16.667 14.167L14.167 11.667" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default Header

