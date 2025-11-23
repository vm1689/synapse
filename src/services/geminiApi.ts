import type { ModelMetrics, ChartPoint, ModelState } from '../store/modelStore'

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
if (!GEMINI_API_KEY) {
  throw new Error('VITE_GEMINI_API_KEY environment variable is required. Please create a .env file with your API key.')
}
const GEMINI_MODEL = 'gemini-3-pro-preview'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

interface GeminiContent {
  role?: 'user' | 'model'
  parts: Array<{ text: string }>
}

interface GeminiRequest {
  contents: GeminiContent[]
  generationConfig?: {
    temperature?: number
    topK?: number
    topP?: number
    maxOutputTokens?: number
  }
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>
    }
  }>
}

export interface SynapseResponse {
  message: string
  updatedPlan?: string
}

export async function generateSynapseResponse(
  userMessage: string,
  username: string,
  conversationHistory: Array<{ username: string; text: string; isAgent: boolean }>,
  planText?: string,
  currentVersion?: number,
  modelState?: ModelState
): Promise<SynapseResponse> {
  // Get current date and time for Gemini to use
  const now = new Date()
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  const displayMinutes = minutes.toString().padStart(2, '0')
  const time = `${displayHours}:${displayMinutes} ${ampm}`
  
  try {
    console.log('Calling Gemini API with model:', GEMINI_MODEL)
    
    // Load plan from file if not provided
    let currentPlanText = planText
    if (!currentPlanText) {
      const { loadPlan } = await import('../store/planStore')
      currentPlanText = await loadPlan()
    }
    
    // Build conversation history for context
    const contents: GeminiContent[] = []

    // Enhanced system prompt with plan modification capabilities
    let systemPrompt = `You are Synapse, a helpful financial modeling assistant. You help users with financial models, NPV calculations, market analysis, and business strategy. Be concise, professional, and helpful.

You have access to the current Drug Valuation. When referring to it in conversation, simply call it "Drug Valuation" (not "Drug Valuation financial model" or "financial model plan"). When a user asks you to modify the plan, you MUST:

1. **ASK FOR CONTEXT IF MISSING**: If a user requests a change without providing sufficient context or rationale, you MUST ask them to provide:
   - Why the change is needed
   - What data, source, or reasoning supports this change
   - Any relevant citations or references

2. **ACCEPT REASONABLE CONTEXT**: If the user provides a source description (e.g. "Nov 2025 CI report"), accept it as the reference. DO NOT ask for detailed citation information (like author, full title, URL) unless the description is completely vague or the user's intent is unclear. Proceed with the update if the user has provided enough context to justify the change.

3. **INCLUDE COMPLETE UPDATED PLAN WITH PROPER FORMATTING**: When you do make changes (after receiving context), you MUST include the COMPLETE updated plan text in a code block. The plan must follow this exact format:

\`\`\`plan
# Drug Valuation
Asset-level financial model for rare disease therapeutic

## Commercial Assumptions

### Timeline

Launch Year: {{value}} [Note: {{complete full context explanation}} {{citation number if provided}} (${username}, ${date} ${time})]
Peak Year: {{value}}
LOE Year: {{value}}

## Pricing & Market
...

## Development Risk
...

## Deal Economics
...

## Output Metrics

rNPV (10%)
Peak Revenue

## References

[1] [Reference text]
[2] [Reference text]
[3] [Reference text]
[4] [New reference if citation provided - format: "Description (additional details if any)"]

## Version History

[Description of change] (Modified by ${username}, ${date} ${time})
\`\`\`

CRITICAL FORMATTING RULES:
- When you modify a line, add a context note with this EXACT format: [Note: {{explanation}} {{citation}} (${username}, ${date} ${time})]
- The note must start with "[Note: " and end with ")]".
- {{explanation}}: Include the COMPLETE full explanation from the user's message. Do not truncate.
- {{citation}}: If a source is provided, add [N] where N is the reference number.
- ALWAYS include metadata: (${username}, ${date} ${time})
- Example: If user says "Modify launch to 2030 due to competitor delay", the line becomes:
  Launch Year: 2030 [Note: Modify launch to 2030 due to competitor delay [4] (${username}, ${date} ${time})]
- IMPORTANT: The note is part of the line. It MUST be on the same line. DO NOT add line breaks inside the context note.
- NEVER truncate context notes.
- Include ALL sections of the plan.
- Use the exact date/time provided.
- In Version History section, prefix the change description with the version number in the format "v[N]: ". Example: "v${(currentVersion || 0) + 1}: Launch year updated... (Modified by ${username}, ${date} ${time})"
- The version number to use for the NEW change is v${(currentVersion || 0) + 1}.

Current Plan:
${currentPlanText}`

    if (modelState) {
      systemPrompt += `

Current Model State:
The user has generated a Python model from this plan. Here are the details:

Metrics:
- rNPV: ${modelState.metrics.rNpv}
- Peak Revenue: ${modelState.metrics.peakRevenue}
- Risk Adjusted: ${modelState.metrics.riskAdjusted}
- PoS: ${modelState.metrics.pos}

Chart Data (Annual Revenue):
${JSON.stringify(modelState.chartData.slice(0, 5))}... (truncated)

Current Python Code (generated):
\`\`\`python
${modelState.code}
\`\`\`

Use this model context to answer questions about the math, specific values, or code logic. If the user asks about "aggregate" vs "annual", check the chart data and code. Usually the chart tracks annual revenue.`
    }

    systemPrompt += `

Respond naturally in conversation. Always ask for context before making changes. When making plan changes (after receiving context), include the complete updated plan in the code block with proper formatting including full context notes, references, and version history.`

    // First message needs to be a user message
    contents.push({
      role: 'user',
      parts: [{ text: systemPrompt }]
    })
    
    // Add a model response to establish the conversation
    contents.push({
      role: 'model',
      parts: [{ text: 'Hello! I\'m Synapse, your financial modeling assistant. I have access to your Drug Valuation and can help you modify it based on our conversation. How can I assist you today?' }]
    })

    // Add ALL conversation history (not just last 10)
    for (const msg of conversationHistory) {
      if (msg.isAgent) {
        contents.push({
          role: 'model',
          parts: [{ text: msg.text }]
        })
      } else {
        contents.push({
          role: 'user',
          parts: [{ text: `${msg.username}: ${msg.text}` }]
        })
      }
    }

    // Add current user message
    contents.push({
      role: 'user',
      parts: [{ text: `${username}: ${userMessage}` }]
    })

    const requestBody: GeminiRequest = {
      contents,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 16384, // Increased to handle full plan with complete context notes
      }
    }

    console.log('Sending request to Gemini API:', JSON.stringify(requestBody, null, 2))
    
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    console.log('Gemini API response status:', response.status)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Gemini API error:', errorData)
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    const data: any = await response.json()
    console.log('Gemini API response data (full):', JSON.stringify(data, null, 2))

    if (!data.candidates || data.candidates.length === 0) {
      console.error('No candidates in response:', data)
      throw new Error('No response from Gemini API')
    }

    const candidate = data.candidates[0]
    console.log('First candidate:', JSON.stringify(candidate, null, 2))

    // Check for finish reason issues
    if (candidate.finishReason === 'MAX_TOKENS') {
      console.warn('Response was truncated due to MAX_TOKENS limit')
      // Try to get partial response anyway
    } else if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      console.warn('Unexpected finish reason:', candidate.finishReason)
    }

    // Handle different response structures
    let responseText: string | undefined
    
    // Try different possible response structures
    if (candidate.content?.parts?.[0]?.text) {
      responseText = candidate.content.parts[0].text
    } else if (candidate.text) {
      responseText = candidate.text
    } else if (typeof candidate.content === 'string') {
      responseText = candidate.content
    } else if (candidate.parts?.[0]?.text) {
      responseText = candidate.parts[0].text
    }

    if (!responseText) {
      // If we have a finish reason, provide a more helpful error
      if (candidate.finishReason === 'MAX_TOKENS') {
        throw new Error('Response was truncated due to token limit. The plan or conversation might be too long.')
      }
      console.error('Could not extract text from response. Full candidate:', JSON.stringify(candidate, null, 2))
      throw new Error(`Could not extract response text from Gemini API. Finish reason: ${candidate.finishReason || 'unknown'}`)
    }
    
    console.log('Gemini response text:', responseText)
    
    // Parse updated plan from response if present
    let updatedPlan: string | undefined
    // Try multiple patterns to catch the plan block
    const planBlockMatch = responseText.match(/```plan\s*([\s\S]*?)\s*```/) || 
                          responseText.match(/```\s*plan\s*([\s\S]*?)\s*```/) ||
                          responseText.match(/```\s*([\s\S]*?)\s*```/)
    
    if (planBlockMatch) {
      updatedPlan = planBlockMatch[1].trim()
      console.log('Found updated plan in response, length:', updatedPlan.length)
      console.log('Updated plan preview:', updatedPlan.substring(0, 200))
    } else {
      console.log('No plan block found in response. Full response:', responseText)
    }
    
    // Remove plan block from message text
    const cleanMessage = responseText.replace(/```plan\s*[\s\S]*?\s*```/g, '').replace(/```\s*plan\s*[\s\S]*?\s*```/g, '').trim()
    
    return {
      message: cleanMessage,
      updatedPlan
    }
  } catch (error: any) {
    console.error('Error calling Gemini API:', error)
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name
    })
    // Fallback response if API fails - include error details in dev
    const errorMsg = `I apologize, but I'm having trouble processing your request. Error: ${error?.message || 'Unknown error'}. Please check the console for details.`
    return {
      message: errorMsg
    }
  }
}

export interface GeneratedModelData {
  code: string
  metrics: {
    rNpv: string
    peakRevenue: string
    riskAdjusted: boolean
    pos: number
    changeAnalysis?: string
  }
  chartData: Array<{ year: number; revenue: number }>
}

export async function generateModelData(planText: string, previousNpv?: string): Promise<GeneratedModelData> {
  try {
    const prompt = `You are a financial modeling expert. Based on the following financial plan, please:
1. Calculate the key financial metrics (rNPV, Peak Revenue).
2. Generate annual revenue data points for the chart (from launch to LOE). IMPORTANT: The revenue forecast MUST follow a standard pharmaceutical adoption curve (S-curve) to a single peak, followed by a decline after LOE (Loss of Exclusivity). Do not include development milestones in the revenue chart data, only product revenue.
3. Generate a complete Python script (using numpy and dataclasses) that implements this model. Keep the code concise and avoid excessive blank lines. Ensure the logic produces a single peak revenue year.
${previousNpv ? `4. Compare the calculated rNPV with the previous version's rNPV (${previousNpv}) and explain the reason for the change in 1 brief sentence (e.g. "Decrease due to delayed launch year...").` : ''}

Plan:
${planText}

You MUST return the result using the following custom tags structure. Do not include any other markdown formatting or explanation.

^^^METRICS^^^
[JSON object for metrics${previousNpv ? ' including "changeAnalysis" field' : ''}]
^^^CHART^^^
[JSON array for chart data]
^^^CODE^^^
[Full python code here - concise, minimal blank lines]

Example format:
^^^METRICS^^^
{
  "rNpv": "$1.18B",
  "peakRevenue": "$1.09B (2036)",
  "riskAdjusted": true,
  "pos": 0.60${previousNpv ? ',\n  "changeAnalysis": "Decrease due to delayed launch year..."' : ''}
}
^^^CHART^^^
[
  { "year": 2028, "revenue": 1000000 },
  ...
]
^^^CODE^^^
import numpy as np...`

    const requestBody = {
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.1, // Low temperature for consistent data generation
        maxOutputTokens: 8192,
      }
    }

    // Retry logic for 503 errors (Service Unavailable)
    const maxRetries = 3
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
          // Try to parse error details
          let errorDetails = ''
          try {
            const errorData = await response.json().catch(() => ({}))
            errorDetails = errorData?.error?.message || errorData?.message || ''
          } catch (e) {
            // Ignore JSON parse errors
          }

          // For 503 errors, retry with exponential backoff
          if (response.status === 503 && attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000 // Exponential backoff: 1s, 2s, 4s
            console.warn(`API returned 503 (Service Unavailable). Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries + 1})`)
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }

          // For other errors or final attempt, throw with detailed message
          const statusText = response.statusText || 'Unknown error'
          const errorMessage = response.status === 503
            ? `Gemini API is temporarily unavailable (503). This usually means the service is overloaded. Please try again in a few moments.${errorDetails ? ` Details: ${errorDetails}` : ''}`
            : response.status === 429
            ? `Rate limit exceeded (429). Please wait a moment before trying again.${errorDetails ? ` Details: ${errorDetails}` : ''}`
            : `API request failed: ${response.status} ${statusText}${errorDetails ? `. Details: ${errorDetails}` : ''}`
          
          throw new Error(errorMessage)
        }

        // Success - break out of retry loop
        const data = await response.json()
        
        // Check for valid response data structure
        const candidate = data.candidates?.[0]
        const part = candidate?.content?.parts?.[0]
        const text = part?.text

        if (!text) {
          console.error('Invalid Gemini response structure. Full response:', JSON.stringify(data, null, 2))
          const finishReason = candidate?.finishReason
          if (finishReason) {
            throw new Error(`Gemini API response blocked or empty. Reason: ${finishReason}`)
          }
          throw new Error('Received invalid response from Gemini API (no text content)')
        }

        const responseText = text
        console.log('Gemini response text:', responseText)
        
        // Continue with parsing...
        // Helper to attempt JSON repair
        const tryParseJSON = (jsonString: string, type: 'object' | 'array') => {
          try {
            return JSON.parse(jsonString)
          } catch (e) {
            console.warn(`Failed to parse ${type}, attempting repair...`)
            // Simple repair for truncated JSON
            let repaired = jsonString.trim()
            if (type === 'object') {
               if (!repaired.endsWith('}')) repaired += '}'
            } else {
               if (!repaired.endsWith(']')) repaired += ']'
            }
            try {
              return JSON.parse(repaired)
            } catch (e2) {
              console.error(`Failed to repair ${type}`, e2)
              throw e // Throw original error to be caught by caller
            }
          }
        }

        const stripCodeFences = (block: string) => {
          let cleaned = block.trim()

          if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:[a-z0-9_-]+)?\s*/i, '')
            const closingFence = cleaned.lastIndexOf('```')
            if (closingFence !== -1) {
              cleaned = cleaned.slice(0, closingFence)
            }
          }

          // Remove any stray code fences that Gemini might inject mid-stream
          cleaned = cleaned.replace(/```(?:[a-z0-9_-]+)?/gi, '')

          return cleaned.trim()
        }

        type TaggedSection = { label: string; content: string }

        const parseTaggedSections = (text: string): TaggedSection[] => {
          const tagRegex = /\^\^\^\s*([^^]+?)\s*\^\^\^/gi
          const matches: Array<{ label: string; tagStart: number; contentStart: number }> = []
          let match: RegExpExecArray | null

          while ((match = tagRegex.exec(text)) !== null) {
            matches.push({
              label: match[1].trim().toUpperCase(),
              tagStart: match.index,
              contentStart: match.index + match[0].length
            })
          }

          return matches.map((current, index) => {
            const next = matches[index + 1]
            const end = next ? next.tagStart : text.length

            return {
              label: current.label,
              content: text.slice(current.contentStart, end).trim()
            }
          })
        }

        const findSection = (sections: TaggedSection[], candidates: string[]): string | undefined => {
          for (const candidate of candidates) {
            const normalized = candidate.toUpperCase()
            const exactMatch = sections.find(section => section.label === normalized)
            if (exactMatch) {
              return exactMatch.content
            }
          }

          // Fallback to partial matches (e.g., "METRICS JSON", "Python Code")
          for (const candidate of candidates) {
            const normalized = candidate.toUpperCase()
            const partialMatch = sections.find(section => 
              section.label.includes(normalized) || normalized.includes(section.label)
            )
            if (partialMatch) {
              return partialMatch.content
            }
          }

          return undefined
        }

        const taggedSections = parseTaggedSections(responseText)
        const metricsSection = findSection(taggedSections, ['METRICS', 'MODEL METRICS'])
        const chartSection = findSection(taggedSections, ['CHART', 'CHART DATA', 'REVENUE'])
        const codeSection = findSection(taggedSections, ['CODE', 'PYTHON CODE', 'MODEL CODE'])

        if (metricsSection && chartSection && codeSection) {
          try {
            return {
              code: stripCodeFences(codeSection),
              metrics: tryParseJSON(stripCodeFences(metricsSection), 'object'),
              chartData: tryParseJSON(stripCodeFences(chartSection), 'array')
            }
          } catch (parseError) {
            console.warn('Failed to parse extracted sections as JSON, attempting fallback', parseError)
          }
        }

        // Fallback: Try to find JSON blocks directly if custom tags failed or parsing failed
        console.log('Attempting fallback JSON parsing...')
        try {
          // Look for a large JSON object structure
          const jsonMatch = responseText.match(/\{[\s\S]*"code"[\s\S]*"metrics"[\s\S]*"chartData"[\s\S]*\}/)
          if (jsonMatch) {
             const parsedData = JSON.parse(jsonMatch[0])
             // Ensure code is a string
             if (typeof parsedData.code !== 'string') {
                parsedData.code = String(parsedData.code)
             }
             return parsedData
          }
          
          // Last ditch: try to parse the whole thing as JSON if it's just a JSON block
          // Clean up markdown code blocks that might wrap the JSON
          const cleanJson = responseText.replace(/```json\s*|\s*```/gi, '')
            .replace(/```\s*|\s*```/g, '') // Remove generic code blocks too
            .trim()

          if (/^[\[{]/.test(cleanJson)) {
            const parsedData = JSON.parse(cleanJson)
            return parsedData
          }
        } catch (e) {
          console.error('Failed to parse response structure', e)
          // If we have a partial code block from custom tags, we might still be able to use it?
          // But the type is GeneratedModelData which requires all fields.
          throw new Error('Failed to parse model data from Gemini response. The model output format was invalid.')
        }
        
        // If we get here, we couldn't parse the response
        throw new Error('Failed to parse model data from Gemini response. The model output format was invalid.')
      } catch (error) {
        lastError = error as Error
        // If it's not a 503 or we've exhausted retries, throw immediately
        if (attempt === maxRetries || (error instanceof Error && !error.message.includes('503'))) {
          throw error
        }
        // Otherwise, continue to next retry
      }
    }

    // If we get here, all retries failed
    throw lastError || new Error('Failed to generate model data after multiple attempts')
  } catch (error) {
    console.error('Error generating model data:', error)
    throw error
  }
}

// Test function to verify Gemini API connection
export async function testGeminiConnection(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    console.log('Testing Gemini API connection...')
    console.log('API Key:', GEMINI_API_KEY ? `${GEMINI_API_KEY.substring(0, 10)}...` : 'NOT SET')
    console.log('Model:', GEMINI_MODEL)
    console.log('URL:', GEMINI_API_URL)

    const testRequest = {
      contents: [
        {
          parts: [{ text: 'Say "Hello, I am Synapse and I am connected to Gemini!" in exactly those words.' }]
        }
      ]
    }

    console.log('Sending test request:', JSON.stringify(testRequest, null, 2))

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testRequest),
    })

    console.log('Response status:', response.status, response.statusText)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('API Error:', errorData)
      return {
        success: false,
        message: `API request failed: ${response.status} ${response.statusText}`,
        details: errorData
      }
    }

    const data: GeminiResponse = await response.json()
    console.log('Response data:', data)

    if (!data.candidates || data.candidates.length === 0) {
      return {
        success: false,
        message: 'No response from Gemini API',
        details: data
      }
    }

    const responseText = data.candidates[0].content.parts[0].text
    console.log('Response text:', responseText)

    return {
      success: true,
      message: responseText,
      details: {
        model: GEMINI_MODEL,
        status: response.status
      }
    }
  } catch (error: any) {
    console.error('Test connection error:', error)
    return {
      success: false,
      message: `Connection test failed: ${error.message || 'Unknown error'}`,
      details: error
    }
  }
}

export interface InfographicResponse {
  imageUrl?: string
  text?: string
  error?: string
}

export async function generateInfographic(
  metrics: ModelMetrics,
  chartData: ChartPoint[],
  npvChange?: { diff: string; pct: string; sign: string; isPositive: boolean; prevValStr: string } | null
): Promise<InfographicResponse> {
  try {
    // Get version history
    const { getHistoryStatus } = await import('../store/planStore')
    const historyStatus = getHistoryStatus()
    const metadata = historyStatus.versionMetadata || {}
    const currentVersion = historyStatus.currentVersion
    
    // Format version history for the prompt
    // We want to show how NPV changed across versions
    let versionHistoryText = 'Version History & Value Evolution:\n'

    // Add explicit calculated change if available (Highest Priority for the Value Bridge)
    if (npvChange) {
      versionHistoryText += `\nCRITICAL - LATEST VALUE CHANGE (Use this for Value Bridge):\n`
      versionHistoryText += `- Delta: ${npvChange.sign}${npvChange.pct}% (${npvChange.sign}$${Math.abs(parseFloat(npvChange.diff))}M)\n`
      versionHistoryText += `- Evolution: Was ${npvChange.prevValStr} -> Now ${metrics.rNpv}\n`
      const currentMeta = metadata[currentVersion]
      if (currentMeta?.reason) {
         versionHistoryText += `- Primary Reason: ${currentMeta.reason}\n`
      }
      versionHistoryText += '\nFull Historical Context:\n'
    }
    
    // Get all versions that have NPV data
    const versions = Object.keys(metadata).map(v => parseInt(v)).sort((a, b) => a - b)
    
    if (versions.length === 0) {
      versionHistoryText += '- No historical version data available.\n'
    } else {
      versions.forEach((v, index) => {
        const meta = metadata[v]
        const npv = meta.npv || 'N/A'
        const reason = meta.reason || 'Unknown change'
        const isCurrent = v === currentVersion ? ' (Current)' : ''
        
        // Calculate % change from previous version if possible
        let changeText = ''
        if (index > 0) {
          const prevV = versions[index - 1]
          const prevNpvStr = metadata[prevV].npv
          const currNpvStr = meta.npv
          
          if (prevNpvStr && currNpvStr) {
            // Extract numbers: "$1.18B" -> 1.18
            const prevVal = parseFloat(prevNpvStr.replace(/[^0-9.]/g, ''))
            const currVal = parseFloat(currNpvStr.replace(/[^0-9.]/g, ''))
            
            if (!isNaN(prevVal) && !isNaN(currVal) && prevVal !== 0) {
              const pctChange = ((currVal - prevVal) / prevVal) * 100
              const sign = pctChange >= 0 ? '+' : ''
              changeText = ` -> Change: ${sign}${pctChange.toFixed(1)}%`
            }
          }
        }
        
        versionHistoryText += `- v${v}: ${npv}${changeText} | Reason: ${reason}${isCurrent}\n`
      })
    }

    // Try different model names - the REST API might use a different format
    const IMAGE_MODEL = 'gemini-3-pro-image-preview'
    // Try v1beta first, fallback to v1alpha if needed
    const IMAGE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`

    // Format the data for the prompt
    const dataSummary = `
Financial Model Data:
- rNPV (10%): ${metrics.rNpv}
- Peak Revenue: ${metrics.peakRevenue}
- Risk-Adjusted: ${metrics.riskAdjusted ? 'Yes' : 'No'}
- Probability of Success: ${Math.round(metrics.pos * 100)}%

Revenue Timeline:
${chartData.map(point => `${point.year}: $${(point.revenue / 1000000).toFixed(1)}M`).join('\n')}

${versionHistoryText}
`

    const prompt = `Create a high-impact, McKinsey-style executive summary slide ("The Insight Page") for this asset valuation.
    
    The goal is to communicate the strategic value story, not just list numbers. The design must be incredibly polished, clean, and authoritative—suitable for a Board of Directors meeting.

    Design & Aesthetic Guidelines (McKinsey/Bain Style):
    1.  **Layout:** Use a classic "T-bar" or "Action Title" layout.
        *   **Action Title:** The headline MUST be a full sentence summarizing the main insight (e.g., "Asset rNPV grows +15% driven by extended exclusivity, despite competitive launch delay.").
        *   **Structure:** Divide the body into 2-3 vertical columns or a clean "Value Bridge" flow.
    2.  **Typography:**
        *   Use clean sans-serif fonts (Helvetica/Arial-like).
        *   **Hierarchy:** High contrast between headers (bold, dark) and body text (regular, gray).
        *   **Numbers:** Big, bold key metrics. Use "k" for thousands, "M" for millions, "B" for billions.
    3.  **Color Palette:** Strict corporate professional.
        *   **Background:** Clean White or extremely light gray (#F5F5F7).
        *   **Primary:** Deep Navy Blue (#0F172A) or Slate (#334155).
        *   **Accent:** Teal/Cyan (#0891B2) for "Positive/Growth", Muted Red (#BE123C) for "Negative/Risk".
        *   **No clutter:** No unnecessary shadows, gradients, or clip art.
    4.  **Visuals:**
        *   **Waterfall Chart (Value Bridge):** CRITICAL. Visualize the change in rNPV (Was X -> Now Y).
        *   **Revenue Curve:** A smooth, simplified area chart showing the sales trajectory.
        *   **Callout Box:** A "Strategic Implications" box with 2-3 bullet points.

    Content to Visualize:
    ${dataSummary}

    Crucial: The "Value Bridge" section must visually demonstrate the change from the previous version to the current version. If the rNPV increased, show a green/teal upward bridge. If it decreased, show a red downward bridge. Label the delta clearly.`

    // Based on Python SDK: response_modalities goes in config (generationConfig in REST API)
    // Try camelCase first (REST API standard), fallback to snake_case if needed
    let requestBody: any = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        responseModalities: ['TEXT', 'IMAGE']
      }
    }

    console.log('Generating infographic with model:', IMAGE_MODEL)
    console.log('Request body:', JSON.stringify(requestBody, null, 2))

    let response = await fetch(`${IMAGE_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    // If camelCase fails with responseModalities error, try snake_case (as used in Python SDK)
    if (!response.ok) {
      let errorText = ''
      try {
        errorText = await response.text()
        const errorData = JSON.parse(errorText)
        const errorMsg = errorData?.error?.message || errorText
        
        if (errorMsg.includes('responseModalities') || errorMsg.includes('Unknown name')) {
          console.log('Trying with snake_case response_modalities...')
          requestBody = {
            contents: [{
              parts: [{ text: prompt }]
            }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 4096,
              response_modalities: ['TEXT', 'IMAGE']
            }
          }
          response = await fetch(`${IMAGE_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          })
        }
      } catch (e) {
        // If we can't parse the error, continue to the error handler below
        console.error('Could not parse initial error response')
      }
    }

    if (!response.ok) {
      let errorData: any = {}
      try {
        const errorText = await response.text()
        console.error('Infographic API error response text:', errorText)
        errorData = JSON.parse(errorText)
      } catch (e) {
        console.error('Could not parse error response as JSON')
      }
      console.error('Infographic API error:', JSON.stringify(errorData, null, 2))
      
      // Extract detailed error message
      const errorMessage = 
        errorData?.error?.message || 
        errorData?.error?.details?.[0]?.errorMessage ||
        errorData?.message || 
        `API request failed: ${response.status} ${response.statusText}`
      
      throw new Error(errorMessage)
    }

    const data: any = await response.json()
    console.log('Infographic API response:', data)

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No response from Gemini API')
    }

    const candidate = data.candidates[0]
    let imageUrl: string | undefined
    let text: string | undefined

    // Extract text and image from response
    // Handle different possible response structures
    const parts = candidate.content?.parts || candidate.parts || []
    
    for (const part of parts) {
      // Extract text
      if (part.text) {
        text = part.text
      }
      
      // Extract image - handle different possible formats
      if (part.inlineData) {
        const mimeType = part.inlineData.mimeType || 'image/png'
        const imageData = part.inlineData.data
        imageUrl = `data:${mimeType};base64,${imageData}`
      } else if (part.image) {
        // Alternative image format
        if (part.image.inlineData) {
          const mimeType = part.image.inlineData.mimeType || 'image/png'
          const imageData = part.image.inlineData.data
          imageUrl = `data:${mimeType};base64,${imageData}`
        }
      } else if (part.data) {
        // Direct data field
        const mimeType = part.mimeType || 'image/png'
        imageUrl = `data:${mimeType};base64,${part.data}`
      }
    }

    // Log what we found for debugging
    if (imageUrl) {
      console.log('Found image in response')
    }
    if (text) {
      console.log('Found text in response:', text.substring(0, 100))
    }

    if (!imageUrl && !text) {
      console.error('Response structure:', JSON.stringify(candidate, null, 2))
      throw new Error('No image or text found in response')
    }

    return {
      imageUrl,
      text
    }
  } catch (error: any) {
    console.error('Error generating infographic:', error)
    return {
      error: error?.message || 'Failed to generate infographic'
    }
  }
}
