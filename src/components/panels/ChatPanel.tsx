import { useState, useRef, useEffect } from 'react'
import { generateSynapseResponse } from '../../services/geminiApi'
import { loadPlan, savePlan } from '../../store/planStore'
import './ChatPanel.css'

interface ChatMessage {
  id: string
  avatar: string
  avatarType: 'user' | 'medical' | 'technical' | 'agent'
  username: string
  timestamp: string
  text: string
  mention?: string
  reactions?: { emoji: string; count?: number }[]
  avatarImage?: string
}

interface User {
  id: string
  name: string
  avatar: string
  avatarType: 'user' | 'medical' | 'technical'
  avatarImage?: string
}

const availableUsers: User[] = [
  { id: 'brad', name: 'Brad, Business Development', avatar: 'Br', avatarType: 'user', avatarImage: '/Brad.jpeg' },
  { id: 'melissa', name: 'Melissa, Medical Affairs', avatar: 'Me', avatarType: 'medical', avatarImage: '/Melissa.jpeg' },
  { id: 'cam', name: 'Cam, Commercial', avatar: 'Ca', avatarType: 'user', avatarImage: '/Cam.jpeg' },
  { id: 'regina', name: 'Regina, Regulatory', avatar: 'Re', avatarType: 'technical', avatarImage: '/Regina.jpeg' },
  { id: 'cindy', name: 'Cindy, Competitive Intelligence', avatar: 'Ci', avatarType: 'technical', avatarImage: '/Cindy.jpeg' },
]

const STORAGE_KEY = 'synapse-chat-messages'

// Load messages from localStorage
const loadMessagesFromStorage = (): ChatMessage[] => {
  // Start with empty chat - don't load from storage on initial load
  return []
  
  // Uncomment below if you want to load saved messages:
  // try {
  //   const stored = localStorage.getItem(STORAGE_KEY)
  //   if (stored) {
  //     return JSON.parse(stored)
  //   }
  // } catch (error) {
  //   console.error('Error loading messages from storage:', error)
  // }
  // return []
}

// Save messages to localStorage
const saveMessagesToStorage = (messages: ChatMessage[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  } catch (error) {
    console.error('Error saving messages to storage:', error)
  }
}

// Helper function to get current time in 12-hour format
const getCurrentTime = (): string => {
  const now = new Date()
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  const displayMinutes = minutes.toString().padStart(2, '0')
  return `${displayHours}:${displayMinutes} ${ampm}`
}

// Helper function to get current date
const getCurrentDate = (): string => {
  const now = new Date()
  return now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Generate a unique ID for messages
const generateMessageId = (): string => {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}


function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessagesFromStorage())
  const [inputValue, setInputValue] = useState('')
  const [selectedUser, setSelectedUser] = useState<User>(availableUsers[0])

  // Update browser title when user changes
  useEffect(() => {
    document.title = `${selectedUser.name} - Synapse`
  }, [selectedUser])

  // Update selected user if the current one is no longer in the list (e.g. after code update)
  useEffect(() => {
    const userExists = availableUsers.find(u => u.id === selectedUser.id)
    if (!userExists) {
      setSelectedUser(availableUsers[0])
    }
  }, [])
  const [isSynapseTyping, setIsSynapseTyping] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Save messages to storage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveMessagesToStorage(messages)
    }
  }, [messages])

  // Listen for storage changes to sync between tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const newMessages = JSON.parse(e.newValue)
          setMessages(newMessages)
        } catch (error) {
          console.error('Error parsing synced messages:', error)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSynapseTyping])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [inputValue])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = async () => {
    if (!inputValue.trim()) return

    console.log('handleSend called with message:', inputValue.trim())

    const userMessage: ChatMessage = {
      id: generateMessageId(),
      avatar: selectedUser.avatar,
      avatarType: selectedUser.avatarType,
      username: selectedUser.name,
      timestamp: getCurrentTime(),
      text: inputValue.trim(),
      avatarImage: selectedUser.avatarImage,
    }

    // Add user message and save to storage
    setMessages(prev => {
      const newMessages = [...prev, userMessage]
      saveMessagesToStorage(newMessages)
      return newMessages
    })
    const messageText = inputValue.trim()
    setInputValue('')

    // Trigger Synapse response using Gemini API
    setIsSynapseTyping(true)
    
    try {
      // Build ALL conversation history for context (not just recent)
      const conversationHistory = messages.map(msg => ({
        username: msg.username,
        text: msg.text,
        isAgent: msg.avatarType === 'agent'
      }))

      // Get current plan as text from file
      const planText = await loadPlan()

      console.log('Calling generateSynapseResponse with:', { 
        messageText, 
        username: selectedUser.name, 
        historyLength: conversationHistory.length,
        planIncluded: true
      })

      // Call Gemini API with all messages and plan
      // Get current plan version from store to pass to API
      const currentHistoryStatus = (await import('../../store/planStore')).getHistoryStatus()
      const currentVersion = currentHistoryStatus.currentVersion || 0
      const { getModelState } = await import('../../store/modelStore')
      const modelState = getModelState()

      const synapseResponse = await generateSynapseResponse(
        messageText,
        selectedUser.name,
        conversationHistory,
        planText,
        currentVersion,
        modelState
      )

      console.log('Received response from Synapse:', synapseResponse)

      // Apply plan update if Synapse provided one
      // Gemini now handles all formatting including context notes, references, and version history
      if (synapseResponse.updatedPlan) {
        console.log('Updating plan with Synapse suggestions (using Gemini-formatted plan directly)')
        
        // Use the plan directly from Gemini - it already includes all formatting
        const updatedPlan = synapseResponse.updatedPlan
        
        console.log('Updated plan from Gemini (first 500 chars):', updatedPlan.substring(0, 500))
        await savePlan(updatedPlan)
        
        // Dispatch event to notify PlanPanel of changes
        const event = new CustomEvent('planUpdated', { detail: updatedPlan })
        window.dispatchEvent(event)
        console.log('Dispatched planUpdated event')
      } else {
        console.log('No plan update in Synapse response')
      }

      const synapseMessage: ChatMessage = {
        id: generateMessageId(),
        avatar: '/synapse.jpeg',
        avatarType: 'agent',
        username: 'Synapse',
        timestamp: getCurrentTime(),
        text: synapseResponse.message,
        avatarImage: '/synapse.jpeg',
      }

      setMessages(prev => {
        const newMessages = [...prev, synapseMessage]
        saveMessagesToStorage(newMessages)
        return newMessages
      })
    } catch (error: any) {
      console.error('Error getting Synapse response:', error)
      // Fallback error message
      const errorResponse: ChatMessage = {
        id: generateMessageId(),
        avatar: '/synapse.jpeg',
        avatarType: 'agent',
        username: 'Synapse',
        timestamp: getCurrentTime(),
        text: `I apologize, but I'm experiencing technical difficulties. Error: ${error.message || 'Unknown error'}`,
        avatarImage: '/synapse.jpeg',
      }
      setMessages(prev => {
        const newMessages = [...prev, errorResponse]
        saveMessagesToStorage(newMessages)
        return newMessages
      })
    } finally {
      setIsSynapseTyping(false)
    }
  }

  const formatMessageText = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|https?:\/\/[^\s]+)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('http')) {
        return (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  return (
    <div className="chat-panel-content">
      <div className="chat-messages">
        {messages.map((message) => (
          <div key={message.id} className="chat-message">
            <div className={`chat-avatar ${message.avatarType}`}>
              {(message.avatarImage || message.avatarType === 'agent') ? (
                <img
                  src={message.avatarImage || message.avatar}
                  alt={message.username}
                  className="chat-avatar-img"
                />
              ) : (
                message.avatar
              )}
            </div>
            <div className="chat-message-content">
              <div className="chat-message-header">
                <span className="chat-username">{message.username}</span>
                {message.mention && (
                  <span className="chat-mention">{message.mention}</span>
                )}
                <span className="chat-timestamp">{message.timestamp}</span>
              </div>
              <div className="chat-message-text">{formatMessageText(message.text)}</div>
              {message.reactions && message.reactions.length > 0 && (
                <div className="chat-reactions">
                  {message.reactions.map((reaction, idx) => (
                    <div key={idx} className="chat-reaction">
                      <span>{reaction.emoji}</span>
                      {reaction.count && (
                        <span className="chat-reaction-count">{reaction.count}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isSynapseTyping && (
          <div className="chat-message">
            <div className="chat-avatar agent">
              <img src="/synapse.jpeg" alt="Synapse" className="chat-avatar-img" />
            </div>
            <div className="chat-message-content">
              <div className="chat-message-header">
                <span className="chat-username">Synapse</span>
                <span className="chat-timestamp">{getCurrentTime()}</span>
              </div>
              <div className="chat-typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <select
            className="model-selector"
            value={selectedUser.id}
            onChange={(e) => {
              const user = availableUsers.find(u => u.id === e.target.value)
              if (user) setSelectedUser(user)
            }}
            style={{ flex: 1 }}
          >
            {availableUsers.map(user => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </div>
        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder="Chat..."
            rows={1}
            value={inputValue}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!inputValue.trim()}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatPanel

