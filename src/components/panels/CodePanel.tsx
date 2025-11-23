import { useEffect, useState, useMemo } from 'react'
import { getModelState, ModelState } from '../../store/modelStore'
import './CodePanel.css'

// Helper to escape HTML characters
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Simple Python syntax highlighter
function highlightPython(code: string): string {
  if (!code) return ''

  // We'll use a single-pass tokenization approach with a master regex.
  // This avoids the issue where replacing one token creates text that looks like another token
  // (e.g., creating HTML tags that then get matched by subsequent regexes).
  
  const tokenPatterns = [
    // 1. Strings (Triple quoted first, then single)
    { type: 'string', regex: /("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"]*"|'[^']*')/ },
    // 2. Comments
    { type: 'comment', regex: /(#.*)/ },
    // 3. Decorators
    { type: 'decorator', regex: /(@\w+)/ },
    // 4. Keywords (must be word boundaries)
    { type: 'keyword', regex: /\b(import|from|as|class|def|return|if|else|elif|while|for|in|try|except|with|pass|continue|break|dataclass)\b/ },
    // 5. Builtins
    { type: 'builtin', regex: /\b(int|float|str|bool|list|dict|set|tuple|len|print|range|self)\b/ },
    // 6. Numbers
    { type: 'number', regex: /\b(\d[\d_]*(\.\d+)?)\b/ },
    // 7. Class/Function Definitions (lookahead-like matching needs handling in loop)
    // We'll handle these slightly differently or just let them be colored by other rules for now to keep it robust.
    // 8. Operators
    { type: 'operator', regex: /(\+|-|\*|\/|=|%|>|<|!|&|\||\^|~|:|->)/ },
    // 9. Whitespace/Other
    { type: 'text', regex: /([\s\S]+?)/ }
  ]

  // Construct master regex
  // We wrap each pattern in a capturing group so we can identify which one matched
  // BUT typical regex engines don't tell you *which* group matched easily in a single replace call without checking arguments.
  // Instead, we'll use a loop to consume the string.

  let remaining = code
  let result = ''

  while (remaining.length > 0) {
    let bestMatch: { type: string, text: string, index: number } | null = null

    // Find the earliest matching token
    for (const pattern of tokenPatterns) {
      // Only match at the START of the remaining string
      const regex = new RegExp('^' + pattern.regex.source)
      const match = remaining.match(regex)

      if (match) {
        // We found a match at the start
        bestMatch = { type: pattern.type, text: match[0], index: 0 }
        break // Priority order defined by array order
      }
    }

    if (bestMatch) {
      // Append highlighted token
      if (bestMatch.type === 'text') {
        result += escapeHtml(bestMatch.text)
      } else {
        result += `<span class="token-${bestMatch.type}">${escapeHtml(bestMatch.text)}</span>`
      }
      // Advance
      remaining = remaining.slice(bestMatch.text.length)
    } else {
      // Fallback: consume one character as text if nothing matched (shouldn't happen due to catch-all, but safe)
      result += escapeHtml(remaining[0])
      remaining = remaining.slice(1)
    }
  }

  // Post-processing for class/function names which are context-dependent
  // (It's harder to do in single pass without state, but we can run a safe replace on the generated HTML
  // because the structure `class <span class="token-text">Name</span>` is predictable if 'Name' wasn't caught as keyword)
  
  // Actually, the previous "placeholder" strategy was robust FOR STRINGS/COMMENTS. 
  // The issue was `class` keyword replacement creating `<span class="...">` which subsequent regexes might have matched.
  // Let's refine the token loop to be context-aware for simple cases like `def name` or `class name`.
  
  return result
}

// Improved highlight function using a Tokenizer approach
function highlightPythonRobust(code: string): string {
  if (!code) return ''

  const patterns = [
    // Strings
    { type: 'string', regex: /"""[\s\S]*?"""|'''.*?'''|"[^"]*"|'[^']*'/ },
    // Comments
    { type: 'comment', regex: /#.*/ },
    // Decorators
    { type: 'decorator', regex: /@\w+/ },
    // Keywords
    { type: 'keyword', regex: /\b(import|from|as|class|def|return|if|else|elif|while|for|in|try|except|with|pass|continue|break|dataclass)\b/ },
    // Class/Function names (contextual)
    { type: 'class-name', regex: /(?<=class\s+)\w+/ }, // Lookbehind support varies, but let's try standard regex structure
    { type: 'function-name', regex: /(?<=def\s+)\w+/ },
    // Builtins
    { type: 'builtin', regex: /\b(int|float|str|bool|list|dict|set|tuple|len|print|range|self)\b/ },
    // Numbers
    { type: 'number', regex: /\b\d[\d_]*(\.\d+)?\b/ },
    // Operators
    { type: 'operator', regex: /[+\-*/%=!&|^~:.<>]+/ },
    // Identifiers (catch-all for other words)
    { type: 'identifier', regex: /\b\w+\b/ },
    // Whitespace and everything else
    { type: 'text', regex: /\s+|[^\s\w"']+/ }
  ]
  
  // Since JS regex doesn't support variable-length lookbehind well in all envs, 
  // and we want a robust parser, let's use a split-and-match approach with prioritized tokens.
  
  // 1. Tokenize safely
  const tokens: { type: string, value: string }[] = []
  let ptr = 0
  
  // Master regex with capturing groups for each type would be ideal but complex to maintain indices.
  // We'll use "match at index" loop.
  
  const combinedRegex = /("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"]*"|'[^']*')|(#.*)|(@\w+)|(\b(?:import|from|as|class|def|return|if|else|elif|while|for|in|try|except|with|pass|continue|break|dataclass)\b)|(\b(?:int|float|str|bool|list|dict|set|tuple|len|print|range|self)\b)|(\b\d[\d_]*(?:\.\d+)?\b)|([+\-*/%=!&|^~:.<>]+)|(\w+)|(\s+)|([^\s\w"']+)/y

  // Group indices:
  // 1: string
  // 2: comment
  // 3: decorator
  // 4: keyword
  // 5: builtin
  // 6: number
  // 7: operator
  // 8: identifier (maybe class/func name)
  // 9: whitespace
  // 10: other
  
  while (ptr < code.length) {
    combinedRegex.lastIndex = ptr
    const match = combinedRegex.exec(code)
    
    if (!match) {
      // Safety break to avoid infinite loop if no match (shouldn't happen with catch-alls)
      tokens.push({ type: 'text', value: code[ptr] })
      ptr++
      continue
    }
    
    const value = match[0]
    let type = 'text'
    
    if (match[1]) type = 'string'
    else if (match[2]) type = 'comment'
    else if (match[3]) type = 'decorator'
    else if (match[4]) type = 'keyword'
    else if (match[5]) type = 'builtin'
    else if (match[6]) type = 'number'
    else if (match[7]) type = 'operator'
    else if (match[8]) {
      type = 'identifier'
      // Contextual check for class/def names based on *previous* non-whitespace token
      // Look backwards in tokens
      let prevTokenIndex = tokens.length - 1
      while (prevTokenIndex >= 0 && tokens[prevTokenIndex].type === 'whitespace') {
        prevTokenIndex--
      }
      
      if (prevTokenIndex >= 0) {
        const prev = tokens[prevTokenIndex]
        if (prev.type === 'keyword' && prev.value === 'class') type = 'class-name'
        else if (prev.type === 'keyword' && prev.value === 'def') type = 'function-name'
      }
    }
    else if (match[9]) type = 'whitespace'
    
    tokens.push({ type, value })
    ptr += value.length
  }
  
  // 2. Render to HTML
  return tokens.map(t => {
    if (t.type === 'whitespace' || t.type === 'identifier' || t.type === 'text') {
      return escapeHtml(t.value)
    }
    return `<span class="token-${t.type}">${escapeHtml(t.value)}</span>`
  }).join('')
}

function CodePanel() {
  const [code, setCode] = useState(getModelState().code)
  const [lastUpdated, setLastUpdated] = useState(getModelState().lastUpdated)
  const [isGenerating, setIsGenerating] = useState(getModelState().status === 'generating')

  // Effect to handle model updates
  useEffect(() => {
    const handleModelUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<ModelState>
      setCode(customEvent.detail.code)
      setLastUpdated(customEvent.detail.lastUpdated)
      setIsGenerating(customEvent.detail.status === 'generating')
    }

    window.addEventListener('modelUpdated', handleModelUpdate)
    return () => window.removeEventListener('modelUpdated', handleModelUpdate)
  }, [])

  const highlightedCode = useMemo(() => highlightPythonRobust(code), [code])

  if (isGenerating) {
    return (
      <div className="code-panel-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="code-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ color: '#71717a', fontSize: '12px', fontStyle: 'italic' }}>Updating the code...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="code-panel-container">
      <div className="code-content">
        <div className="code-line">
          <span className="token-comment"># Last updated: {lastUpdated}</span>
        </div>
        <div className="code-line"></div>
        <pre className="code-block">
          <code dangerouslySetInnerHTML={{ __html: highlightedCode }} />
        </pre>
      </div>
    </div>
  )
}

export default CodePanel
