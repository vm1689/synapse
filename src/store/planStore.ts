import type { ChartPoint } from './modelStore'

const PLAN_FILE_PATH = '/plan.txt'
const STORAGE_KEY = 'fm_v2_plan_data'

const LEGACY_PLAN_TITLE = /^#\s*Biopharm NPV Model\b/mi

function normalizePlanTitle(planText: string): string {
  if (!planText) return planText
  return planText.replace(LEGACY_PLAN_TITLE, '# Drug Valuation')
}

export interface VersionMetadata {
  reason: string
  npv?: string // stored as string "$1.18B"
  chartData?: ChartPoint[] // stored for comparison
  timestamp: number
  changeDescription?: string
}

interface PlanStorage {
  currentPlan: string
  history: string[]
  historyIndex: number
  timestamp: number
  versionMetadata: Record<number, VersionMetadata> // version number -> metadata
}

// Get next citation number
export function getNextCitationNumber(planText: string): number {
  const citationMatches = planText.match(/\[(\d+)\]/g)
  if (!citationMatches || citationMatches.length === 0) return 1
  const numbers = citationMatches.map(m => parseInt(m.replace(/[\[\]]/g, '')))
  return Math.max(...numbers) + 1
}

// Add citation to a plan line (with citation number)
export function addCitationToLine(line: string, citationNum: number, username: string, timestamp: string): string {
  // Check if line already has a citation
  if (line.match(/\[\d+\]/)) {
    return line
  }
  // Add citation with metadata
  return `${line} [${citationNum}] (${username}, ${timestamp})`
}

// Add metadata to a plan line (without citation number, just user and timestamp)
export function addMetadataToLine(line: string, username: string, timestamp: string): string {
  // Check if line already has metadata
  if (line.match(/\([^)]+,\s*\d+:\d+\s*(AM|PM)\)$/)) {
    return line
  }
  // Add metadata without citation
  return `${line} (${username}, ${timestamp})`
}

// Add reference entry
export function addReference(planText: string, citationNum: number, changeDescription: string, username: string, timestamp: string): string {
  // Get current version from history index + 1 (since historyIndex is 0-based and we want next version)
  // If we're about to save this change, it will be historyIndex + 1
  // With 1-based versioning:
  // Index 0 = v1. Next change creates v2.
  // So if historyIndex is 0, we want 2.
  const currentVer = historyIndex + 2;
  const refEntry = `[${currentVer}.${citationNum}] ${changeDescription} - Modified by ${username} on ${timestamp}`
  
  // Split plan into lines to find the References section more accurately
  const lines = planText.split('\n')
  let refSectionLineIndex = -1
  
  // Find the References section by looking for it as a standalone header
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line === '## References' || line === '# References') {
      refSectionLineIndex = i
      break
    }
  }
  
  if (refSectionLineIndex !== -1) {
    // Found References section - insert the reference after the header
    const newLines = [...lines]
    // Insert the reference entry right after the References header
    newLines.splice(refSectionLineIndex + 1, 0, refEntry)
    return newLines.join('\n')
  } else {
    // No References section found - add it at the end
    return `${planText}\n\n## References\n${refEntry}`
  }
}

// Add context note to a plan line (with citation if available, metadata, date & timestamp)
export function addContextNote(line: string, context: string, citationNum: number | null, username: string, timestamp: string, date: string): string {
  // Ensure we have context
  if (!context || context.trim().length === 0) {
    context = 'Plan modification'
  }
  
  // Create concise context note (max 300 chars, but preserve complete words)
  let conciseContext = context.trim()
  if (conciseContext.length > 300) {
    // Truncate at word boundary
    conciseContext = conciseContext.substring(0, 300)
    const lastSpace = conciseContext.lastIndexOf(' ')
    if (lastSpace > 250) {
      conciseContext = conciseContext.substring(0, lastSpace) + '...'
    } else {
      conciseContext = conciseContext.substring(0, 297) + '...'
    }
  }
  
  // Build note with citation if available, always include username, date & timestamp
  let note = `[Note: ${conciseContext}`
  if (citationNum) {
    note += ` [${citationNum}]`
  }
  // Always add metadata (username, date, timestamp)
  note += ` (${username}, ${date} ${timestamp})]`
  
  const result = `${line} ${note}`
  console.log('addContextNote result:', result)
  return result
}

// In-memory plan storage to avoid auto-downloads
let inMemoryPlan: string | null = null;

// Simple version history
const planHistory: string[] = [];
let historyIndex = -1;
// Version metadata map
let versionMetadata: Record<number, VersionMetadata> = {};

const MAX_HISTORY = 50;

// Helper to persist state
function persistState() {
  try {
    const state: PlanStorage = {
      currentPlan: inMemoryPlan || '',
      history: planHistory,
      historyIndex: historyIndex,
      timestamp: Date.now(),
      versionMetadata: versionMetadata
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('Failed to save plan state to localStorage:', e)
  }
}

// Listen for storage changes from other tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const state: PlanStorage = JSON.parse(e.newValue)
        
        // Only update if timestamp is newer or different
        // (For simplicity, we just trust the event from other tab is the latest source of truth)
        if (state.currentPlan) {
          inMemoryPlan = state.currentPlan
          
          // Update history
          planHistory.length = 0
          planHistory.push(...state.history)
          historyIndex = state.historyIndex
          
          // Update metadata
          versionMetadata = state.versionMetadata || {}
          
          console.log('Synced plan from other tab', { version: historyIndex })
          
          // Notify UI
          const event = new CustomEvent('planUpdated', { detail: inMemoryPlan });
          window.dispatchEvent(event);
        }
      } catch (err) {
        console.error('Error syncing plan from storage:', err)
      }
    }
  })
}

// Extract change description from plan text
function extractChangeReason(plan: string): string {
  // Look for Version History section
  const versionHistoryMatch = plan.match(/## Version History\s+([\s\S]*?)$/);
  if (versionHistoryMatch) {
    const historyText = versionHistoryMatch[1];
    // Look for the last entry
    // Matches: [Description] (Modified by...)
    // Or v[N]: [Description] (Modified by...)
    const lines = historyText.trim().split('\n').filter(line => line.trim().length > 0);
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      // Try to extract just the description
      // Remove "v[N]: " prefix if present
      let description = lastLine.replace(/^v\d+:\s*/, '');
      // Remove "(Modified by...)" suffix
      description = description.replace(/\s*\(Modified by.*?\)$/, '');
      // Remove leading brackets if present (legacy format)
      description = description.replace(/^\[(.*?)\]/, '$1');
      
      return description.trim();
    }
  }
  return "Plan modification";
}

// Add current plan to history
function addToHistory(plan: string, explicitReason?: string) {
  const normalizedPlan = normalizePlanTitle(plan)
  // If we're not at the end of history (due to undo), truncate future
  if (historyIndex < planHistory.length - 1) {
    planHistory.splice(historyIndex + 1);
    // Also clear metadata for future versions
    for (let i = historyIndex + 2; i <= MAX_HISTORY; i++) {
      delete versionMetadata[i];
    }
  }
  
  // Add new plan
  planHistory.push(normalizedPlan);
  historyIndex++;
  
  // Limit history size
  if (planHistory.length > MAX_HISTORY) {
    planHistory.shift();
    historyIndex--;
    // Re-index metadata? Simplest is just to let old keys rot or shift them.
    // For simplicity in this prototype, we won't shift metadata keys, assuming short sessions.
  }
  
  // Capture metadata
  const reason = explicitReason || extractChangeReason(plan);
  const versionNum = historyIndex + 1; // 1-based versioning
  
  versionMetadata[versionNum] = {
    reason: reason,
    timestamp: Date.now()
  };
  
  console.log(`Added to history. Size: ${planHistory.length}, Index: ${historyIndex}, Reason: ${reason}`);
  persistState();
}

// Update NPV and chart data for a specific version
export function updateVersionData(version: number, npv: string, chartData: ChartPoint[]) {
  if (versionMetadata[version]) {
    versionMetadata[version].npv = npv;
    versionMetadata[version].chartData = chartData;
    persistState();
    // Notify UI
    const event = new CustomEvent('planUpdated', { detail: inMemoryPlan });
    window.dispatchEvent(event);
  } else {
    // If metadata doesn't exist for this version (e.g. initial load), create it
    versionMetadata[version] = {
      reason: "Initial Plan",
      timestamp: Date.now(),
      npv: npv,
      chartData: chartData
    };
    persistState();
  }
}

// Undo to previous version
export async function undoPlan(): Promise<string | null> {
  if (historyIndex > 0) {
    historyIndex--;
    const previousPlan = planHistory[historyIndex];
    inMemoryPlan = previousPlan;
    
    persistState();
    
    // Notify UI
    const event = new CustomEvent('planUpdated', { detail: previousPlan });
    window.dispatchEvent(event);
    
    return previousPlan;
  }
  return null;
}

// Redo to next version
export async function redoPlan(): Promise<string | null> {
  if (historyIndex < planHistory.length - 1) {
    historyIndex++;
    const nextPlan = planHistory[historyIndex];
    inMemoryPlan = nextPlan;
    
    persistState();
    
    // Notify UI
    const event = new CustomEvent('planUpdated', { detail: nextPlan });
    window.dispatchEvent(event);
    
    return nextPlan;
  }
  return null;
}

// Get history status
export function getHistoryStatus() {
  return {
    canUndo: historyIndex > 0,
    canRedo: historyIndex < planHistory.length - 1,
    // Return 1-based version number (index 0 = v1)
    // If no history (index -1), return 0
    currentVersion: historyIndex + 1,
    totalVersions: planHistory.length,
    versionMetadata // Expose metadata
  };
}

// Load plan from memory or file
export async function loadPlan(): Promise<string> {
  // If we have an in-memory plan, return it
  if (inMemoryPlan !== null) {
    return inMemoryPlan;
  }

  // Try loading from localStorage first
  try {
    const savedState = localStorage.getItem(STORAGE_KEY)
    if (savedState) {
      const state: PlanStorage = JSON.parse(savedState)
      // Simple validation
      if (state.currentPlan && Array.isArray(state.history)) {
        const normalizedPlan = normalizePlanTitle(state.currentPlan)
        inMemoryPlan = normalizedPlan
        
        // Restore history
        planHistory.length = 0
        const normalizedHistory = state.history.map(normalizePlanTitle)
        planHistory.push(...normalizedHistory)
        historyIndex = state.historyIndex
        versionMetadata = state.versionMetadata || {}
        
        // Backfill v1 if missing
        if (!versionMetadata[1] || !versionMetadata[1].npv) {
           import('./modelStore').then(({ defaultState }) => {
             updateVersionData(1, defaultState.metrics.rNpv, defaultState.chartData);
           }).catch(e => console.warn('Failed to backfill v1 metadata', e));
        }
        
        console.log('Restored plan from localStorage', { version: historyIndex })
        persistState()
        
        // Notify UI of initial load/restore
        // This ensures sync status indicators are correct
        const event = new CustomEvent('planUpdated', { detail: inMemoryPlan });
        window.dispatchEvent(event);
        
        return inMemoryPlan
      }
    }
  } catch (e) {
    console.warn('Failed to load plan from localStorage:', e)
  }

  // Fallback to file
  try {
    const response = await fetch(PLAN_FILE_PATH)
    if (response.ok) {
      const planText = await response.text()
      // Store initial plan in memory
      const normalizedPlan = normalizePlanTitle(planText.trim())
      inMemoryPlan = normalizedPlan;
      // Initialize history
      if (planHistory.length === 0) {
        addToHistory(normalizedPlan, "Initial Plan");
        
        // Initialize v1 metadata with default values
        import('./modelStore').then(({ defaultState }) => {
           updateVersionData(1, defaultState.metrics.rNpv, defaultState.chartData);
        }).catch(err => console.error('Failed to init v1 metadata', err));
      }
      
      // Notify UI of initial load
      const event = new CustomEvent('planUpdated', { detail: inMemoryPlan });
      window.dispatchEvent(event);
      
      return normalizedPlan;
    } else {
      console.error('Failed to load plan file:', response.status)
      return ''
    }
  } catch (error) {
    console.error('Error loading plan from file:', error)
    return ''
  }
}

// Synchronous version for initial load (returns empty string, will be updated async)
export function loadPlanSync(): string {
  return inMemoryPlan || '';
}

// Initialize file handle (call this once to get user permission)
export async function initializeFileHandle(): Promise<void> {
  // No-op since we're using in-memory storage
}

// Save plan to in-memory storage
export async function savePlan(plan: string, reason?: string): Promise<void> {
  try {
    const normalizedPlan = normalizePlanTitle(plan);
    // Only add to history if changed
    if (normalizedPlan !== inMemoryPlan) {
      // Inject version into history entries if not already present
      // This is a bit of a hack, but we need to update the version number in the plan text before saving
      // However, since the prompt generation happens before this, we rely on the LLM to include the right context note
      // The version tracking in history is handled by the historyIndex
      
      addToHistory(normalizedPlan, reason);
    }
    
    inMemoryPlan = normalizedPlan;
    console.log('Plan saved to in-memory storage');
    persistState();
    
  } catch (error) {
    console.error('Error saving plan:', error);
  }
}

// Reset plan to default (reload from file)
export async function resetPlanToDefault(): Promise<void> {
  try {
    const response = await fetch(PLAN_FILE_PATH)
    if (response.ok) {
      const planText = await response.text()
      
      // Clear history
      planHistory.length = 0
      historyIndex = -1
      versionMetadata = {}
      
      await savePlan(planText.trim(), "Reset to default")
      
      // Clear local storage
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem('fm_v2_model') // Also clear model state to ensure full reset
      
      // Reload the page to show the default plan
      window.location.reload()
    }
  } catch (error) {
    console.error('Error resetting plan to default:', error)
  }
}
