import { useState, useEffect } from 'react'
import { loadPlan, resetPlanToDefault, getHistoryStatus } from '../../store/planStore'
import './PlanPanel.css'

function PlanPanel() {
  const [planText, setPlanText] = useState<string>('')
  const [version, setVersion] = useState({ current: 1, total: 1 })
  
  // Load plan from file on mount
  useEffect(() => {
    loadPlan().then(text => {
      setPlanText(text)
      updateVersion()
    })
  }, [])

  // Update version state
  const updateVersion = () => {
    const status = getHistoryStatus()
    setVersion({ 
      current: status.currentVersion || 1, 
      total: status.totalVersions || 1 
    })
  }

  // Listen for plan updates from Synapse
  useEffect(() => {
    const handlePlanUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<string>
      console.log('PlanPanel received planUpdated event')
      console.log('New plan text preview:', customEvent.detail?.substring(0, 200))
        if (customEvent.detail) {
          setPlanText(customEvent.detail)
          updateVersion()
        }
    }
    
    window.addEventListener('planUpdated', handlePlanUpdate)
    return () => {
      window.removeEventListener('planUpdated', handlePlanUpdate)
    }
  }, [])

  // Parse plan text into display format
  const rawLines = planText.split('\n').filter(line => line.trim())
  const lines: string[] = []
  
  // Pre-process lines to merge split context notes
  for (let i = 0; i < rawLines.length; i++) {
    let currentLine = rawLines[i]
    
    // Check if line has an open [Note: but no closing ]
    // We check if [Note: exists, but the pattern [Note: ... ] does not
    if (currentLine.includes('[Note:') && !/\[Note:.*\]/.test(currentLine)) {
      // Look ahead to merge subsequent lines until we find the closing ]
      // Stop if we hit a header or run out of lines
      let j = i + 1
      while (j < rawLines.length) {
        const nextLine = rawLines[j]
        // Stop merging if we hit a section header
        if (nextLine.trim().startsWith('#')) break
        
        // Add a space if the current line doesn't end with one and next line doesn't start with one
        // This prevents "dateto" when merging "date" and "to"
        const separator = (currentLine.endsWith(' ') || nextLine.startsWith(' ')) ? '' : ' '
        currentLine += separator + nextLine.trim()
        
        // Mark the merged line as processed so we skip it in the main loop
        // We do this by modifying rawLines which is not ideal but works for this simple loop
        // A better way is to advance the outer index 'i'
        i = j 
        
        // If we found the closing bracket, stop merging
        if (currentLine.includes(']')) break
        j++
      }
    }
    lines.push(currentLine)
  }
  
  // Extract references section
  const references: Array<{ id: string; text: string; url: string }> = []
  const contentLines: string[] = []
  let inReferences = false
  
  lines.forEach(line => {
    if (line.startsWith('## References') || line.startsWith('# References')) {
      inReferences = true
      return
    }
    
    // If we hit a new section header while in references (like Version History), exit references mode
    if (inReferences && (line.startsWith('# ') || line.startsWith('## '))) {
      inReferences = false
    }

    if (inReferences) {
      // Parse reference: [1] Text - URL or [1] Text - Modified by user on timestamp
      const refMatchWithUrl = line.match(/\[(\d+)\]\s*(.+?)\s*-\s*(https?:\/\/\S+)/)
      const refMatchWithModification = line.match(/\[(\d+)\]\s*(.+?)\s*-\s*Modified by (.+?) on (.+)/)
      const refMatchWithoutUrl = line.match(/\[(\d+)\]\s*(.+)/)
      
      if (refMatchWithUrl) {
        references.push({
          id: refMatchWithUrl[1],
          text: refMatchWithUrl[2],
          url: refMatchWithUrl[3]
        })
      } else if (refMatchWithModification) {
        references.push({
          id: refMatchWithModification[1],
          text: refMatchWithModification[2],
          url: '#' // Modification entry, no URL
        })
      } else if (refMatchWithoutUrl) {
        references.push({
          id: refMatchWithoutUrl[1],
          text: refMatchWithoutUrl[2],
          url: '#' // Placeholder if no URL
        })
      } else if (line.trim().length > 0) {
        // If line doesn't match reference format but has content, treat as regular line
        // This handles cases where Version History might be inside References block without header
        // or malformed reference lines
        contentLines.push(line)
      }
    } else {
      contentLines.push(line)
    }
  })
  
  console.log('Plan content lines:', contentLines)
  console.log('References found:', references)
  
  // Check if plan has inline citations
  const hasInlineCitations = contentLines.some(line => /\[\d+\]/.test(line))
  console.log('Plan has inline citations:', hasInlineCitations)
  
  // Function to render text with inline citations, metadata, and context notes
  const renderWithCitations = (text: string) => {
    if (!text) return null
    
    // First, extract context notes [Note: ...]
    // Use greedy match to capture everything up to the last ] to handle nested brackets like [1]
    const contextNoteMatch = text.match(/\[Note:(.*)\]/)
    let mainText = text
    let contextNote: string | null = null
    
    if (contextNoteMatch) {
      contextNote = contextNoteMatch[1].trim()
      mainText = text.replace(contextNoteMatch[0], '').trim()
    }
    
    // Split by citation pattern [1], [2], etc. including metadata like [1] (username, timestamp)
    // Also handle metadata without citation: (username, timestamp)
    const parts = mainText.split(/(\[\d+\](?:\s*\([^)]+\))?|\([^,]+,\s*\d+:\d+\s*(?:AM|PM)\))/g)
    const renderedParts = parts.map((part, i) => {
      // Match citation with optional metadata: [1] or [1] (username, timestamp)
      const citationMatch = part.match(/^\[(\d+)\](?:\s*\(([^)]+)\))?$/)
      if (citationMatch) {
        const refId = citationMatch[1]
        const metadata = citationMatch[2] || ''
        const ref = references.find(r => r.id === refId)
        
        // Create citation element with metadata as tooltip
        const citationElement = (
          <a
            key={i}
            href={ref?.url && ref.url !== '#' ? ref.url : `#ref-${refId}`}
            target={ref?.url && ref.url !== '#' ? '_blank' : undefined}
            rel={ref?.url && ref.url !== '#' ? 'noopener noreferrer' : undefined}
            className="plan-citation"
            title={metadata || ref?.text || `Reference ${refId}`}
            onClick={!ref?.url || ref.url === '#' ? (e) => {
              e.preventDefault()
              const targetRef = document.getElementById(`ref-${refId}`)
              if (targetRef) {
                targetRef.scrollIntoView({ behavior: 'smooth', block: 'center' })
                // Add highlight effect
                targetRef.classList.add('highlight-ref')
                setTimeout(() => targetRef.classList.remove('highlight-ref'), 2000)
              }
            } : undefined}
          >
            [{refId}]
          </a>
        )
        
        // If there's metadata, show it after the citation
        if (metadata) {
          return (
            <span key={i}>
              {citationElement}
              <span className="plan-citation-meta"> ({metadata})</span>
            </span>
          )
        }
        return citationElement
      }
      
      // Match metadata without citation: (username, timestamp)
      const metadataMatch = part.match(/^\(([^,]+),\s*(\d+:\d+\s*(?:AM|PM))\)$/)
      if (metadataMatch) {
        const username = metadataMatch[1]
        const timestamp = metadataMatch[2]
        return (
          <span key={i} className="plan-citation-meta" title={`Modified by ${username} on ${timestamp}`}>
            ({username}, {timestamp})
          </span>
        )
      }
      
      return <span key={i}>{part}</span>
    })
    
    // Add context note if present
    if (contextNote) {
      // Parse context note: "context text [4] (username, date timestamp)"
      const contextParts = contextNote.match(/^(.+?)(?:\s*\[(\d+)\])?\s*\(([^,]+),\s*([^)]+)\)$/)
      if (contextParts) {
        const contextText = contextParts[1].trim()
        const citationNum = contextParts[2]
        const username = contextParts[3]
        const dateTime = contextParts[4]
        const ref = citationNum ? references.find(r => r.id === citationNum) : null
        
        return (
          <span>
            {renderedParts}
            <span className="plan-context-note" title={`Context: ${contextText}${ref ? ` | Source: ${ref.text}` : ''} | Modified by ${username} on ${dateTime}`}>
              {' '}[Note: {contextText}
              {citationNum && (
                <a
                  href={ref?.url && ref.url !== '#' ? ref.url : `#ref-${citationNum}`}
                  target={ref?.url && ref.url !== '#' ? '_blank' : undefined}
                  rel={ref?.url && ref.url !== '#' ? 'noopener noreferrer' : undefined}
                  className="plan-citation"
                  onClick={!ref?.url || ref.url === '#' ? (e) => {
                    e.preventDefault()
                    const targetRef = document.getElementById(`ref-${citationNum}`)
                    if (targetRef) {
                      targetRef.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      // Add highlight effect
                      targetRef.classList.add('highlight-ref')
                      setTimeout(() => targetRef.classList.remove('highlight-ref'), 2000)
                    }
                  } : undefined}
                >
                  {' '}[{citationNum}]
                </a>
              )}
              {' '}({username}, {dateTime})]
            </span>
          </span>
        )
      }
    }
    
    return <span>{renderedParts}</span>
  }
  
  return (
    <div className="plan-panel-content">
      <div className="plan-text-content">
        {contentLines.map((line, index) => {
          // Format headers - keep same font size, just different color
          if (line.startsWith('# ')) {
            return <div key={index} className="plan-title">{line.replace('# ', '')}</div>
          }
          if (line.startsWith('## ')) {
            return <div key={index} className="plan-title" style={{ marginTop: '20px' }}>{line.replace('## ', '')}</div>
          }
          // Format values - keep same font size, highlight with color
          if (line.includes(':')) {
            const [label, ...valueParts] = line.split(':')
            const value = valueParts.join(':').trim()
            // Highlight values with color but same font size
            // Updated regex to handle commas in currency values like $285,000
            const valueMatch = value.match(/(\$[\d,.]+[BMK]?|[\d.]+%|[\d,]+|Q\d \d{4})/i)
            if (valueMatch) {
              const startIndex = valueMatch.index!
              const matchLength = valueMatch[0].length
              const prefix = value.substring(0, startIndex)
              const matchVal = valueMatch[0]
              const suffix = value.substring(startIndex + matchLength)

              return (
                <div key={index} className="plan-detail">
                  {label}: {prefix}<span className="plan-value">{matchVal}</span>{renderWithCitations(suffix)}
                </div>
              )
            }
            // Regular line with colon - always render with citations
            return (
              <div key={index} className="plan-detail">
                {label}: {renderWithCitations(value)}
              </div>
            )
          }
          // Regular text - always render with citations
          return <div key={index} className="plan-detail">{renderWithCitations(line)}</div>
        })}
        
        {/* References section */}
        {references.length > 0 && (
          <div className="plan-citations-section">
            <div className="plan-title" style={{ marginTop: '20px' }}>References</div>
            {references.map((ref) => (
              <div key={ref.id} id={`ref-${ref.id}`} className="plan-detail">
                {ref.url && ref.url !== '#' ? (
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="plan-citation-item"
                  >
                    [{ref.id}] {ref.text}
                  </a>
                ) : (
                  <span className="plan-citation-item">
                    [{ref.id}] {ref.text}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default PlanPanel

