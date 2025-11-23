
// Simple event-based store for model data (code, metrics, chart)
// Following the pattern in planStore.ts

export interface ModelMetrics {
  rNpv: string // e.g. "$1.18B"
  peakRevenue: string // e.g. "$1.09B (2036)"
  riskAdjusted: boolean
  pos: number // e.g. 0.60
  changeAnalysis?: string // e.g. "NPV decreased by 12% primarily due to..."
}

export interface ChartPoint {
  year: number
  revenue: number // in millions or absolute value, we'll handle formatting
}

export type ModelStatus = 'idle' | 'generating' | 'success' | 'error'

export interface ModelState {
  code: string
  metrics: ModelMetrics
  chartData: ChartPoint[]
  lastUpdated: string
  status: ModelStatus
  generatedFromVersion: number // tracks plan version used for generation
}

// Initial default state (matching the hardcoded values in panels)
export const defaultState: ModelState = {
  code: `# NPV Model - Auto-generated from plan.md
# Last updated: 2025-11-22 09:35:17

import numpy as np
from dataclasses import dataclass

@dataclass
class NPVModel:
    # Commercial Assumptions
    launch_year: int = 2028
    peak_year: int = 2036
    loe_year: int = 2040

    # Pricing & Market
    net_price: float = 285_000
    price_growth: float = 0.025
    target_population: int = 8_500
    peak_penetration: float = 0.45

    # Risk Parameters
    prob_success: float = 0.60
    discount_rate: float = 0.10

    # Deal Terms
    royalty_tier1: float = 0.12
    royalty_tier2: float = 0.18
    tier_threshold: float = 500_000_000

    def calculate_revenue(self, year: int) -> float:
        """Calculate annual revenue for given year"""
        if year < self.launch_year:
            return 0.0

        years_since_launch = year - self.launch_year
        price = self.net_price * (1 + self.price_growth) ** years_since_launch

        # S-curve penetration
        penetration = self._calculate_penetration(years_since_launch)
        patients = self.target_population * penetration

        return price * patients`,
  metrics: {
    rNpv: "$1.18B",
    peakRevenue: "$1.09B (2036)",
    riskAdjusted: true,
    pos: 0.60
  },
  chartData: [
    { year: 2028, revenue: 0 },
    { year: 2029, revenue: 150000000 },
    { year: 2030, revenue: 350000000 },
    { year: 2031, revenue: 600000000 },
    { year: 2032, revenue: 850000000 },
    { year: 2033, revenue: 1000000000 },
    { year: 2034, revenue: 1050000000 },
    { year: 2035, revenue: 1080000000 },
    { year: 2036, revenue: 1090000000 },
    { year: 2037, revenue: 1000000000 },
    { year: 2038, revenue: 900000000 },
    { year: 2039, revenue: 800000000 },
    { year: 2040, revenue: 700000000 }
  ],
  lastUpdated: new Date().toLocaleString(),
  status: 'idle',
  generatedFromVersion: 1 // Default corresponds to v1 plan
}

// Try to load from localStorage
const savedState = localStorage.getItem('fm_v2_model')
let currentState: ModelState = savedState ? JSON.parse(savedState) : { ...defaultState }

// Listen for storage changes from other tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'fm_v2_model' && e.newValue) {
      try {
        const newState: ModelState = JSON.parse(e.newValue)
        currentState = newState
        
        console.log('Synced model from other tab', { status: newState.status })
        
        // Notify UI
        const event = new CustomEvent('modelUpdated', { detail: currentState })
        window.dispatchEvent(event)
      } catch (err) {
        console.error('Error syncing model from storage:', err)
      }
    }
  })
}

export function getModelState(): ModelState {
  return currentState
}

export function updateModel(newState: Partial<ModelState>) {
  currentState = { 
    ...currentState, 
    ...newState, 
    lastUpdated: new Date().toLocaleString() 
  }
  
  // Persist to localStorage
  try {
    localStorage.setItem('fm_v2_model', JSON.stringify(currentState))
  } catch (e) {
    console.warn('Failed to save model to localStorage:', e)
  }

  const event = new CustomEvent('modelUpdated', { detail: currentState })
  window.dispatchEvent(event)
}

// Function to download code as a file
export function downloadModelCode() {
  const blob = new Blob([currentState.code], { type: 'text/x-python' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'model.py'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
