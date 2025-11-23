import React, { useState, useRef, useEffect } from 'react'
import Panel from './Panel'
import ResizeHandle from './ResizeHandle'
import ChatPanel from './panels/ChatPanel'
import PlanPanel from './panels/PlanPanel'
import CodePanel from './panels/CodePanel'
import ModelPanel from './panels/ModelPanel'
import { getHistoryStatus } from '../store/planStore'
import { getModelState, ModelStatus, ModelState } from '../store/modelStore'
import './PanelsContainer.css'

function PanelsContainer() {
  const [panelFlexes, setPanelFlexes] = useState([1, 1, 1, 1])
  const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(new Set())
  const [planVersion, setPlanVersion] = useState(0)
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle')
  const [generatedVersion, setGeneratedVersion] = useState(0)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const isResizingRef = useRef(false)
  const currentHandleRef = useRef<number | null>(null)
  const startXRef = useRef(0)
  const startFlexesRef = useRef<number[]>([])

  const togglePanel = (panelName: string) => {
    setCollapsedPanels(prev => {
      const newSet = new Set(prev)
      if (newSet.has(panelName)) {
        newSet.delete(panelName)
      } else {
        newSet.add(panelName)
      }
      return newSet
    })
  }

  const handleMouseDown = (handleIndex: number, e: React.MouseEvent) => {
    isResizingRef.current = true
    currentHandleRef.current = handleIndex
    startXRef.current = e.clientX
    startFlexesRef.current = [...panelFlexes]
    e.preventDefault()
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current || currentHandleRef.current === null) return

      const handleIndex = currentHandleRef.current
      const leftIndex = handleIndex
      const rightIndex = handleIndex + 1

      if (collapsedPanels.has(`panel-${leftIndex}`) || collapsedPanels.has(`panel-${rightIndex}`)) {
        return
      }

      if (!containerRef.current) return

      const containerWidth = containerRef.current.offsetWidth
      const deltaX = e.clientX - startXRef.current
      const deltaFlex = (deltaX / containerWidth) * panels.length

      setPanelFlexes(prev => {
        const newFlexes = [...prev]
        const leftFlex = Math.max(0.2, startFlexesRef.current[leftIndex] + deltaFlex)
        const rightFlex = Math.max(0.2, startFlexesRef.current[rightIndex] - deltaFlex)
        newFlexes[leftIndex] = leftFlex
        newFlexes[rightIndex] = rightFlex
        return newFlexes
      })
    }

    const handleMouseUp = () => {
      isResizingRef.current = false
      currentHandleRef.current = null
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [collapsedPanels])

  useEffect(() => {
    const updateVersion = () => {
      const status = getHistoryStatus()
      setPlanVersion(status.currentVersion || 0)
    }
    
    updateVersion()
    window.addEventListener('planUpdated', updateVersion)
    return () => window.removeEventListener('planUpdated', updateVersion)
  }, [])

  // Listen for model status updates
  useEffect(() => {
    const updateModelStatus = (event: Event) => {
      const customEvent = event as CustomEvent<ModelState>
      setModelStatus(customEvent.detail.status)
      setGeneratedVersion(customEvent.detail.generatedFromVersion)
    }
    
    // Initialize
    const state = getModelState()
    setModelStatus(state.status)
    setGeneratedVersion(state.generatedFromVersion)
    
    window.addEventListener('modelUpdated', updateModelStatus)
    return () => window.removeEventListener('modelUpdated', updateModelStatus)
  }, [])

  // Listen for cross-tab sync events
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sync_status_event' && e.newValue) {
        try {
          const event = JSON.parse(e.newValue)
          // Only react to events from other tabs (timestamp check could be added if needed)
          if (event.type === 'start') {
            setModelStatus('generating')
          } else if (event.type === 'success') {
            // Force reload of model state since it was updated in another tab
            // We need to wait a brief moment for the localStorage model update to propagate
            setTimeout(() => {
              const { getModelState } = require('../store/modelStore')
              const newState = getModelState()
              // Trigger local update
              const updateEvent = new CustomEvent('modelUpdated', { detail: newState })
              window.dispatchEvent(updateEvent)
              
              // Also ensure generated version is updated to match plan
              if (event.version) {
                setGeneratedVersion(event.version)
              }
            }, 100)
          } else if (event.type === 'error') {
            setModelStatus('error')
          }
        } catch (err) {
          console.error('Error handling sync event:', err)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

    const handleUpdateCodeAndModel = async () => {
    console.log('Update Code & Model clicked')
    
    // Import dynamically
    const { loadPlan, getHistoryStatus, updateVersionData } = await import('../store/planStore')
    const { generateModelData } = await import('../services/geminiApi')
    const { updateModel } = await import('../store/modelStore')

    // Set status to generating
    updateModel({ status: 'generating' })

    // Broadcast sync start event for other tabs
    const syncStartEvent = new CustomEvent('syncStart')
    window.dispatchEvent(syncStartEvent)
    localStorage.setItem('sync_status_event', JSON.stringify({ type: 'start', timestamp: Date.now() }))

    try {
      const planText = await loadPlan()
      const { currentVersion, versionMetadata } = getHistoryStatus()
      
      if (!planText) {
        console.error('No plan text found')
        updateModel({ status: 'error' })
        return
      }

      console.log('Generating model data...')
      
      // Get previous NPV for comparison context
      let previousNpv: string | undefined
      const prevVersion = currentVersion - 1
      
      if (versionMetadata && versionMetadata[prevVersion] && versionMetadata[prevVersion].npv) {
        previousNpv = versionMetadata[prevVersion].npv
      } else if (prevVersion === 1) {
        // Fallback to default state for v1 if metadata is missing
        const { defaultState } = await import('../store/modelStore')
        previousNpv = defaultState.metrics.rNpv
      }

      const modelData = await generateModelData(planText, previousNpv)
      console.log('Received model data:', modelData)

      updateModel({
        code: modelData.code,
        metrics: modelData.metrics,
        chartData: modelData.chartData,
        status: 'success',
        generatedFromVersion: currentVersion
      })

      // Update NPV and chart data for version history
      if (modelData.metrics && modelData.metrics.rNpv) {
        updateVersionData(currentVersion, modelData.metrics.rNpv, modelData.chartData)
      }

      // Broadcast sync success event for other tabs
      localStorage.setItem('sync_status_event', JSON.stringify({ 
        type: 'success', 
        timestamp: Date.now(),
        version: currentVersion 
      }))

    } catch (error: any) {
      console.error('Error updating model:', error)
      updateModel({ status: 'error' })
      
      // Broadcast sync error event for other tabs
      localStorage.setItem('sync_status_event', JSON.stringify({ type: 'error', timestamp: Date.now() }))

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to update model: ${errorMessage}. Please check the console for details.`)
    }
  }

  const isSynced = generatedVersion === planVersion

  // Reusable sync status component
  // version prop allows overriding the displayed version (e.g. for plan panel)
  // isPlanPanel prop handles specific behavior for plan panel (hiding "Out of Sync" text when button is shown)
  const SyncStatus = ({ version, isPlanPanel }: { version?: number, isPlanPanel?: boolean }) => {
    const isGenerating = modelStatus === 'generating'
    const displayVersion = version !== undefined ? version : generatedVersion
    
    let statusText = isSynced ? 'Synced' : 'Out of Sync'
    let dotClass = isSynced ? 'synced' : 'out-of-sync'
    
    if (isGenerating) {
      statusText = 'Syncing...'
      dotClass = 'syncing'
    } else if (isPlanPanel && !isSynced) {
      // When out of sync in Plan Panel, we hide the "Out of Sync" text because the button is there
      // But we still want to show the version number
      statusText = ''
    }

    return (
      <div className="sync-status" title={isSynced ? 'Up to date with plan' : 'Plan has changed since last update'}>
        <div className={`sync-dot ${dotClass}`} />
        <span className="sync-text">
          {statusText}
          {!isGenerating && <span className="sync-version" style={{ marginLeft: statusText ? undefined : 0 }}>v{displayVersion}</span>}
        </span>
      </div>
    )
  }

  const panels = [
    { name: 'Group Chat', component: <ChatPanel />, headerActions: null },
    { 
      name: 'plan', 
      component: <PlanPanel />,
      headerActions: null,
      titleSuffix: (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <SyncStatus version={planVersion} isPlanPanel={true} />
          {(!isSynced && modelStatus !== 'generating') && (
            <button 
              className="panel-header-btn" 
              onClick={handleUpdateCodeAndModel}
              style={{ 
                color: '#eab308',
                borderColor: 'rgba(234, 179, 8, 0.3)',
                background: 'rgba(234, 179, 8, 0.1)'
              }}
            >
              Sync Code & Model
            </button>
          )}
        </div>
      )
    },
    { 
      name: 'code', 
      component: <CodePanel />, 
      headerActions: null,
      titleSuffix: <SyncStatus />
    },
    { 
      name: 'market model', 
      component: <ModelPanel />, 
      headerActions: null,
      titleSuffix: <SyncStatus />
    },
  ]

  return (
    <div className="panels-container" ref={containerRef}>
      {panels.map((panel, index) => (
        <React.Fragment key={panel.name}>
          <Panel
            panelName={panel.name}
            flex={panelFlexes[index]}
            isCollapsed={collapsedPanels.has(`panel-${index}`)}
            onToggle={() => togglePanel(`panel-${index}`)}
            headerActions={panel.headerActions}
            titleSuffix={(panel as any).titleSuffix}
          >
            {panel.component}
          </Panel>
          {index < panels.length - 1 && (
            <ResizeHandle
              handleIndex={index}
              onMouseDown={handleMouseDown}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

export default PanelsContainer
