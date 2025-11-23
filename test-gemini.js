// Simple test script to verify Gemini API connection
// Run with: node test-gemini.js
// Requires GEMINI_API_KEY environment variable

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
if (!GEMINI_API_KEY) {
  console.error('❌ Error: GEMINI_API_KEY environment variable is required')
  console.error('   Set it with: export GEMINI_API_KEY=your_key_here')
  process.exit(1)
}
const GEMINI_MODEL = 'gemini-3-pro-preview'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

async function testConnection() {
  console.log('🧪 Testing Gemini API Connection...\n')
  console.log('Model:', GEMINI_MODEL)
  console.log('API Key:', GEMINI_API_KEY.substring(0, 20) + '...')
  console.log('URL:', GEMINI_API_URL)
  console.log('\n---\n')

  try {
    const testRequest = {
      contents: [
        {
          parts: [{ text: 'Say "Hello, I am Dolores and I am connected to Gemini-3-Pro!" in exactly those words.' }]
        }
      ]
    }

    console.log('Sending request...')
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testRequest),
    })

    console.log('Response Status:', response.status, response.statusText)
    console.log('\n---\n')

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('❌ API Error:', JSON.stringify(errorData, null, 2))
      return false
    }

    const data = await response.json()
    
    if (!data.candidates || data.candidates.length === 0) {
      console.error('❌ No response from API')
      console.log('Full response:', JSON.stringify(data, null, 2))
      return false
    }

    const responseText = data.candidates[0].content.parts[0].text
    console.log('✅ Connection Successful!\n')
    console.log('Response:', responseText)
    console.log('\n---\n')
    console.log('Full API Response:', JSON.stringify(data, null, 2))
    return true
  } catch (error) {
    console.error('❌ Connection Test Failed:', error.message)
    console.error('Error details:', error)
    return false
  }
}

// Run the test
testConnection().then(success => {
  process.exit(success ? 0 : 1)
})

