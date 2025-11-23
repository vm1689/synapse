import { useEffect, useRef, useState, useMemo } from 'react'
import { getModelState, ModelState, ChartPoint, defaultState } from '../../store/modelStore'
import { getHistoryStatus, VersionMetadata } from '../../store/planStore'
import { generateInfographic } from '../../services/geminiApi'
import './ModelPanel.css'

function ModelPanel() {
  const [modelState, setModelState] = useState<ModelState>(getModelState())
  const [isGenerating, setIsGenerating] = useState(getModelState().status === 'generating')
  const [infographicUrl, setInfographicUrl] = useState<string | null>(null)
  const [isGeneratingInfographic, setIsGeneratingInfographic] = useState(false)
  const [infographicError, setInfographicError] = useState<string | null>(null)
  const [prevVersionData, setPrevVersionData] = useState<{ npv: string, chartData: ChartPoint[] } | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const chartLineRef = useRef<SVGPolylineElement>(null)

  // Function to fetch previous version data
  const updateComparisonData = () => {
    const { generatedFromVersion } = getModelState()
    if (!generatedFromVersion || generatedFromVersion <= 1) {
      setPrevVersionData(null)
      return
    }

    const { versionMetadata } = getHistoryStatus()
    // Find the previous version that has data
    // We want the immediate previous version (generatedFromVersion - 1)
    const prevVersion = generatedFromVersion - 1
    const meta = versionMetadata[prevVersion]
    
    if (meta && meta.npv) {
      setPrevVersionData({
        npv: meta.npv,
        chartData: meta.chartData || []
      })
    } else if (prevVersion === 1) {
      // If v1 data is missing but we are comparing against v1, fallback to defaultState
      setPrevVersionData({
        npv: defaultState.metrics.rNpv,
        chartData: defaultState.chartData
      })
    } else {
      setPrevVersionData(null)
    }
  }

  useEffect(() => {
    const handleModelUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<ModelState>
      setModelState(customEvent.detail)
      setIsGenerating(customEvent.detail.status === 'generating')
      updateComparisonData()
    }
    
    // Also listen for plan updates as they might bring new history metadata
    const handlePlanUpdate = () => {
      updateComparisonData()
    }

    // Initial load
    updateComparisonData()

    window.addEventListener('modelUpdated', handleModelUpdate)
    window.addEventListener('planUpdated', handlePlanUpdate)
    
    return () => {
      window.removeEventListener('modelUpdated', handleModelUpdate)
      window.removeEventListener('planUpdated', handlePlanUpdate)
    }
  }, [])

  // Re-trigger animation when data changes
  useEffect(() => {
    if (chartLineRef.current) {
      // Reset animation
      chartLineRef.current.style.animation = 'none'
      chartLineRef.current.offsetHeight // trigger reflow
      
      const length = chartLineRef.current.getTotalLength()
      chartLineRef.current.style.strokeDasharray = `${length}`
      chartLineRef.current.style.strokeDashoffset = `${length}`
      chartLineRef.current.style.animation = 'drawLine 1.5s ease forwards'
    }
  }, [modelState.chartData])

  // Handle ESC key to close fullscreen
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isFullscreen])

  // Helper to generate SVG points string
  const generatePoints = (data: ChartPoint[], width: number, height: number, startX: number, startY: number, minYear: number, yearRange: number, maxRevenue: number) => {
    if (!data || data.length === 0) return ''
    
    return data.map(point => {
      const x = startX + ((point.year - minYear) / yearRange) * width
      const y = startY - (point.revenue / (maxRevenue * 1.1)) * height
      return `${x},${y}`
    }).join(' ')
  }

  const chartDataInfo = useMemo(() => {
    const { chartData } = modelState
    if (!chartData || chartData.length === 0) return null

    const width = 320
    const height = 120
    const startX = 40
    const startY = 160

    // Calculate ranges based on current data AND previous data (to ensure scale is correct for both)
    const allYears = [...chartData.map(d => d.year)]
    const allRevenues = [...chartData.map(d => d.revenue)]
    
    if (prevVersionData?.chartData && prevVersionData.chartData.length > 0) {
      allYears.push(...prevVersionData.chartData.map(d => d.year))
      allRevenues.push(...prevVersionData.chartData.map(d => d.revenue))
    }

    const minYear = Math.min(...allYears)
    const maxYear = Math.max(...allYears)
    const maxRevenue = Math.max(...allRevenues)
    const yearRange = maxYear - minYear || 1

    return {
      currentPoints: generatePoints(chartData, width, height, startX, startY, minYear, yearRange, maxRevenue),
      prevPoints: prevVersionData?.chartData ? generatePoints(prevVersionData.chartData, width, height, startX, startY, minYear, yearRange, maxRevenue) : null,
      minYear,
      maxYear,
      maxRevenue,
      yearRange,
      width,
      height,
      startX,
      startY
    }
  }, [modelState.chartData, prevVersionData])

  const peakPoint = useMemo(() => {
    const { chartData } = modelState
    if (!chartData || chartData.length === 0 || !chartDataInfo) return null

    const maxRevenue = Math.max(...chartData.map(d => d.revenue))
    const peakData = chartData.find(d => d.revenue === maxRevenue)
    
    if (!peakData) return null

    const { width, height, startX, startY, minYear, yearRange, maxRevenue: globalMaxRevenue } = chartDataInfo
    
    const cx = startX + ((peakData.year - minYear) / yearRange) * width
    const cy = startY - (peakData.revenue / (globalMaxRevenue * 1.1)) * height

    return { cx, cy, revenue: modelState.metrics.peakRevenue }
  }, [modelState.chartData, modelState.metrics.peakRevenue, chartDataInfo])

  // Calculate peak point for previous version
  const prevPeakPoint = useMemo(() => {
    if (!prevVersionData?.chartData || prevVersionData.chartData.length === 0 || !chartDataInfo) return null

    const maxRevenue = Math.max(...prevVersionData.chartData.map(d => d.revenue))
    const peakData = prevVersionData.chartData.find(d => d.revenue === maxRevenue)
    
    if (!peakData) return null

    const { width, height, startX, startY, minYear, yearRange, maxRevenue: globalMaxRevenue } = chartDataInfo
    
    const cx = startX + ((peakData.year - minYear) / yearRange) * width
    const cy = startY - (peakData.revenue / (globalMaxRevenue * 1.1)) * height

    // Convert revenue to formatted string (e.g. $1.09B)
    const formattedRevenue = `$${(maxRevenue / 1000000000).toFixed(2)}B`

    return { cx, cy, revenue: formattedRevenue }
  }, [prevVersionData, chartDataInfo])

  const { metrics } = modelState

  // Calculate NPV change
  const npvChange = useMemo(() => {
    if (!prevVersionData?.npv || !metrics.rNpv) return null
    
    const parseVal = (s: string) => {
      const clean = s.replace(/[^0-9.BMK]/gi, '')
      let val = parseFloat(clean.replace(/[BMK]/gi, ''))
      if (clean.toUpperCase().includes('B')) val *= 1000000000
      else if (clean.toUpperCase().includes('M')) val *= 1000000
      else if (clean.toUpperCase().includes('K')) val *= 1000
      return val
    }

    const currVal = parseVal(metrics.rNpv)
    const prevVal = parseVal(prevVersionData.npv)
    
    if (isNaN(currVal) || isNaN(prevVal) || prevVal === 0) return null
    
    const diff = currVal - prevVal
    const pct = (diff / prevVal) * 100
    const sign = diff >= 0 ? '+' : ''
    
    return {
      prevValStr: prevVersionData.npv,
      diff: diff.toFixed(2),
      pct: pct.toFixed(1),
      sign,
      isPositive: diff >= 0
    }
  }, [metrics.rNpv, prevVersionData])

  const handleGenerateInfographic = async () => {
    setIsGeneratingInfographic(true)
    setInfographicError(null)
    setInfographicUrl(null)

    try {
      const result = await generateInfographic(modelState.metrics, modelState.chartData, npvChange)
      if (result.error) {
        setInfographicError(result.error)
      } else if (result.imageUrl) {
        setInfographicUrl(result.imageUrl)
      } else {
        setInfographicError('No image was generated')
      }
    } catch (error: any) {
      setInfographicError(error?.message || 'Failed to generate infographic')
    } finally {
      setIsGeneratingInfographic(false)
    }
  }

  const minYear = chartDataInfo ? chartDataInfo.minYear : 0
  const maxYear = chartDataInfo ? chartDataInfo.maxYear : 0
  const midYear = Math.floor((minYear + maxYear) / 2)
  const maxRevenueVal = chartDataInfo ? chartDataInfo.maxRevenue : 0

  if (isGenerating) {
    return (
      <div className="model-panel-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ color: '#71717a', fontSize: '12px', fontStyle: 'italic' }}>Updating the model...</div>
      </div>
    )
  }

  return (
    <div className="model-panel-content">
      <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Revenue Forecast ({minYear}-{maxYear})</span>
        {chartDataInfo?.prevPoints && (
          <div style={{ display: 'flex', gap: '10px', fontSize: '10px', fontWeight: 'normal' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '10px', height: '2px', background: '#22d3ee' }}></div>
              <span style={{ color: '#22d3ee' }}>v{modelState.generatedFromVersion}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '10px', height: '2px', background: '#71717a', borderTop: '1px dashed #71717a' }}></div>
              <span style={{ color: '#71717a' }}>v{modelState.generatedFromVersion - 1}</span>
            </div>
          </div>
        )}
      </div>
      
      <div className="model-chart">
        <svg className="chart-svg" viewBox="0 0 400 200">
          {/* Grid lines */}
          <line x1="40" y1="20" x2="40" y2="160" className="grid-line" />
          <line x1="40" y1="160" x2="360" y2="160" className="grid-line" />
          
          {/* 66% line */}
          <line
            x1="40"
            y1="80"
            x2="360"
            y2="80"
            className="grid-line"
            strokeDasharray="2,2"
          />
          
          {/* 33% line */}
          <line
            x1="40"
            y1="120"
            x2="360"
            y2="120"
            className="grid-line"
            strokeDasharray="2,2"
          />

          {/* 100% line (approx, scaling factor 1.1) */}
          <line
            x1="40"
            y1="40"
            x2="360"
            y2="40"
            className="grid-line"
            strokeDasharray="2,2"
          />

          {/* Previous version ghost line */}
          {chartDataInfo?.prevPoints && (
            <polyline
              className="chart-line-ghost"
              points={chartDataInfo.prevPoints}
              style={{ stroke: '#71717a', strokeWidth: 2, strokeDasharray: '4,4', fill: 'none', opacity: 0.4 }}
            />
          )}

          {/* Revenue curve */}
          <polyline
            ref={chartLineRef}
            className="chart-line"
            points={chartDataInfo?.currentPoints || ''}
          />

          {/* Axis labels */}
          <text x="50" y="175" className="axis-label">
            {minYear}
          </text>
          <text x="180" y="175" className="axis-label">
            {midYear}
          </text>
          <text x="340" y="175" className="axis-label">
            {maxYear}
          </text>

          {/* Y Axis Labels */}
          <text x="35" y="163" className="axis-label" textAnchor="end">$0</text>
          <text x="35" y="123" className="axis-label" textAnchor="end">
            ${((maxRevenueVal * 1.1 * 0.33) / 1000000000).toFixed(1)}B
          </text>
          <text x="35" y="83" className="axis-label" textAnchor="end">
            ${((maxRevenueVal * 1.1 * 0.66) / 1000000000).toFixed(1)}B
          </text>
          <text x="35" y="43" className="axis-label" textAnchor="end">
            ${((maxRevenueVal * 1.1) / 1000000000).toFixed(1)}B
          </text>
          
          {/* Previous Peak marker */}
          {prevPeakPoint && (
            <>
              <circle cx={prevPeakPoint.cx} cy={prevPeakPoint.cy} r="3" fill="#71717a" opacity="0.6" />
              <text x={Math.min(prevPeakPoint.cx + 10, 300)} y={Math.max(prevPeakPoint.cy - 5, 20)} className="axis-label" fill="#71717a" style={{ fontSize: '9px' }}>
                {prevPeakPoint.revenue}
              </text>
            </>
          )}

          {/* Peak marker */}
          {peakPoint && (
            <>
              <circle cx={peakPoint.cx} cy={peakPoint.cy} r="4" fill="#22d3ee" />
              <text x={Math.min(peakPoint.cx + 10, 300)} y={Math.max(peakPoint.cy - 5, 20)} className="axis-label" fill="#22d3ee">
                Peak: {peakPoint.revenue.split(' ')[0]}
              </text>
            </>
          )}
        </svg>
      </div>

      <div className="chart-title" style={{ marginTop: '30px' }}>
        Key Metrics
      </div>
      <div className="model-metrics">
        <div>
          <span className="metric-label">rNPV (10%):</span>{' '}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="metric-value">
              {metrics.rNpv}
              {npvChange && (
                <span className="metric-change" style={{ 
                  marginLeft: '8px', 
                  fontSize: '0.6em', 
                  verticalAlign: 'middle',
                  color: npvChange.isPositive ? '#4ade80' : '#f87171' 
                }}>
                  {npvChange.sign}{npvChange.pct}%
                </span>
              )}
            </span>
            {npvChange && (
              <span style={{ fontSize: '11px', color: '#71717a', marginTop: '2px' }}>
                {metrics.changeAnalysis ? metrics.changeAnalysis : `was ${npvChange.prevValStr} in v${modelState.generatedFromVersion - 1}`}
              </span>
            )}
          </div>
        </div>
        <div>
          <span className="metric-label">Peak Revenue:</span>{' '}
          <span className="metric-value">{metrics.peakRevenue}</span>
        </div>
        <div className="metric-divider">
          <span className="metric-label">Risk-Adjusted:</span>{' '}
          <span className={metrics.riskAdjusted ? "metric-value-warning" : "metric-value"}>
            {metrics.riskAdjusted ? "Yes" : "No"} ({Math.round(metrics.pos * 100)}% PoS)
          </span>
        </div>
      </div>

      <div className="chart-title" style={{ marginTop: '30px' }}>
        Infographic
      </div>
      <div className="infographic-section">
        <button
          className="infographic-generate-btn"
          onClick={handleGenerateInfographic}
          disabled={isGeneratingInfographic}
        >
          {isGeneratingInfographic ? 'Generating...' : 'Generate Infographic'}
        </button>
        
        {infographicError && (
          <div className="infographic-error">
            Error: {infographicError}
          </div>
        )}
        
        {infographicUrl && (
          <>
            <div className="infographic-container">
              <img 
                src={infographicUrl} 
                alt="Financial Model Infographic" 
                className="infographic-image"
                onClick={() => setIsFullscreen(true)}
                style={{ cursor: 'pointer' }}
              />
            </div>
            {isFullscreen && (
              <div 
                className="infographic-fullscreen-overlay"
                onClick={() => setIsFullscreen(false)}
              >
                <div 
                  className="infographic-fullscreen-content"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="infographic-close-btn"
                    onClick={() => setIsFullscreen(false)}
                    aria-label="Close fullscreen"
                  >
                    ×
                  </button>
                  <img 
                    src={infographicUrl} 
                    alt="Financial Model Infographic" 
                    className="infographic-fullscreen-image"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ModelPanel
