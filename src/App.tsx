import Header from './components/Header'
import PanelsContainer from './components/PanelsContainer'
import './App.css'

function App() {
  return (
    <div className="ide-container">
      <Header />
      <div className="main-content">
        <div className="workspace-bar">
          <div className="workspace-id">
            <span className="workspace-label">Workspace:</span>
            <span className="workspace-name-mono">Drug Valuation</span>
          </div>
          <button className="workspace-share-btn" title="Share workspace">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 5L21 5L21 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 14L20.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M19 14V19C19 19.5304 18.7893 20.0391 18.4142 20.4142C18.0391 20.7893 17.5304 21 17 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V7C3 6.46957 3.21071 5.96086 3.58579 5.58579C3.96086 5.21071 4.46957 5 5 5H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <PanelsContainer />
      </div>
    </div>
  )
}

export default App

