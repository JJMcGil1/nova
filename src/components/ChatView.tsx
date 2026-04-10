import { useState, useRef, useEffect, useCallback } from 'react'
import { FiFolder, FiX, FiArrowUp, FiSquare, FiPaperclip, FiChevronDown } from 'react-icons/fi'
import { FaGithub } from 'react-icons/fa'

const MODEL_OPTIONS = [
  { id: 'sonnet', label: 'Sonnet 4.6', desc: 'Fast & capable' },
  { id: 'opus', label: 'Opus 4.6', desc: 'Most intelligent' },
  { id: 'haiku', label: 'Haiku 4.5', desc: 'Fastest' },
] as const

interface ChatViewProps {
  threadId: string
  project?: NovaProject
  projects: NovaProject[]
  onSetProject: (projectId: string | undefined) => void
}

export default function ChatView({ threadId, project, projects, onSetProject }: ChatViewProps) {
  const [messages, setMessages] = useState<NovaMessage[]>([])
  const [input, setInput] = useState('')
  const [showProjectSelector, setShowProjectSelector] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [authStatus, setAuthStatus] = useState<ClaudeAuthStatus | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('sonnet')
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [attachments, setAttachments] = useState<{ name: string; path: string }[]>([])
  const modelSelectorRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const activeStreamId = useRef<string | null>(null)

  // Detect auth on mount
  useEffect(() => {
    const detect = async () => {
      const claude = window.electronAPI?.claude
      if (!claude) return
      const status = await claude.detectAuth()
      setAuthStatus(status)
    }
    detect()
  }, [])

  // Load messages from DB when thread changes
  useEffect(() => {
    const load = async () => {
      if (!threadId) return
      const api = window.electronAPI?.db
      if (!api) return
      const msgs = await api.getMessages(threadId)
      setMessages(msgs)
    }
    load()
    // Reset streaming state on thread switch
    setIsStreaming(false)
    setStreamingText('')
    activeStreamId.current = null
  }, [threadId])

  // Subscribe to stream events
  useEffect(() => {
    const claude = window.electronAPI?.claude
    if (!claude) return

    const unsubDelta = claude.onStreamDelta(({ streamId, text }) => {
      if (streamId === activeStreamId.current) {
        setStreamingText(text)
      }
    })

    const unsubEnd = claude.onStreamEnd(({ streamId, text }) => {
      if (streamId === activeStreamId.current) {
        const finalText = text || ''
        // Persist the assistant message to DB
        const msgId = (Date.now() + 1).toString()
        const assistantMsg: NovaMessage = {
          id: msgId,
          thread_id: threadId,
          role: 'assistant',
          content: finalText,
          created_at: new Date().toISOString(),
        }

        window.electronAPI?.db?.addMessage({
          id: msgId,
          threadId,
          role: 'assistant',
          content: finalText,
        })

        setMessages((prev) => [...prev, assistantMsg])
        setIsStreaming(false)
        setStreamingText('')
        activeStreamId.current = null
      }
    })

    const unsubError = claude.onStreamError(({ streamId, error }) => {
      if (streamId === activeStreamId.current) {
        // Show error as a system message
        const msgId = (Date.now() + 1).toString()
        const errorMsg: NovaMessage = {
          id: msgId,
          thread_id: threadId,
          role: 'system',
          content: `Error: ${error}`,
          created_at: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, errorMsg])
        setIsStreaming(false)
        setStreamingText('')
        activeStreamId.current = null
      }
    })

    return () => {
      unsubDelta()
      unsubEnd()
      unsubError()
    }
  }, [threadId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [input])

  // Close model selector on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modelSelectorRef.current && !modelSelectorRef.current.contains(e.target as Node)) {
        setShowModelSelector(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const pickAttachment = useCallback(async () => {
    const result = await window.electronAPI?.pickFile?.()
    if (result && !result.canceled && result.filePaths?.length) {
      const filePath = result.filePaths[0]
      const name = filePath.split('/').pop() || filePath
      setAttachments(prev => [...prev, { name, path: filePath }])
    }
  }, [])

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || !threadId || isStreaming) return

    const api = window.electronAPI?.db
    const claude = window.electronAPI?.claude
    if (!api || !claude) return

    const userMsg: NovaMessage = {
      id: Date.now().toString(),
      thread_id: threadId,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }

    // Persist user message
    await api.addMessage({
      id: userMsg.id,
      threadId,
      role: 'user',
      content: text,
    })

    setMessages((prev) => [...prev, userMsg])
    setInput('')

    // Build conversation history from existing messages
    const allMsgs = [...messages, userMsg]
    const conversationHistory = allMsgs
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-20) // Last 20 messages for context
      .map((m) => ({ role: m.role, content: m.content }))

    // Build system prompt with project context
    let systemPrompt: string | undefined
    if (project) {
      const repoInfo = project.githubRepo || project.github_repo
      systemPrompt = `You are Nova, a helpful AI assistant. The user is working in the project "${project.name}"${repoInfo ? ` (GitHub: ${repoInfo})` : ''}${project.path ? ` located at ${project.path}` : ''}.`
    }

    // Start streaming
    const streamId = `stream-${Date.now()}`
    activeStreamId.current = streamId
    setIsStreaming(true)
    setStreamingText('')

    await claude.chat({
      streamId,
      prompt: text,
      model: selectedModel,
      systemPrompt,
      projectPath: project?.path,
      // Don't pass history for CLI mode - it's included in the prompt
      // For API mode, pass properly formatted history
      conversationHistory: conversationHistory.slice(0, -1), // Exclude current message (sent as prompt)
    })
    // Clear attachments after send
    setAttachments([])
  }, [input, threadId, isStreaming, messages, project, selectedModel])

  const abortStream = useCallback(async () => {
    if (activeStreamId.current) {
      await window.electronAPI?.claude?.abort(activeStreamId.current)
      setIsStreaming(false)

      // Save whatever we have so far
      if (streamingText) {
        const msgId = (Date.now() + 1).toString()
        const partialMsg: NovaMessage = {
          id: msgId,
          thread_id: threadId,
          role: 'assistant',
          content: streamingText + '\n\n*(response interrupted)*',
          created_at: new Date().toISOString(),
        }
        await window.electronAPI?.db?.addMessage({
          id: msgId,
          threadId,
          role: 'assistant',
          content: partialMsg.content,
        })
        setMessages((prev) => [...prev, partialMsg])
      }

      setStreamingText('')
      activeStreamId.current = null
    }
  }, [streamingText, threadId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const placeholder = authStatus && !authStatus.authenticated
    ? 'Sign in to Claude Code to start chatting...'
    : project
      ? `Message Nova about ${project.name}...`
      : 'Message Nova...'

  const isGithubProject = (p: NovaProject) => !!(p.githubRepo || p.github_repo)

  return (
    <div className="chat-view">
      {project && (
        <div className="chat-project-bar">
          <div className="chat-project-badge">
            {isGithubProject(project) ? <FaGithub size={12} /> : <FiFolder size={12} />}
            <span>{project.name}</span>
            {(project.githubRepo || project.github_repo) && (
              <span className="chat-project-badge-sub">{project.githubRepo || project.github_repo}</span>
            )}
            {project.path && (
              <span className="chat-project-badge-sub">{project.path}</span>
            )}
          </div>
          <button
            className="chat-project-change"
            onClick={() => onSetProject(undefined)}
            title="Remove project context"
          >
            <FiX size={12} />
          </button>
        </div>
      )}

      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message chat-message-${msg.role}`}>
            <div className="chat-message-avatar">
              {msg.role === 'assistant' ? '✦' : msg.role === 'system' ? '!' : ''}
            </div>
            <div className="chat-message-content">{msg.content}</div>
          </div>
        ))}
        {isStreaming && (
          <div className="chat-message chat-message-assistant">
            <div className="chat-message-avatar">✦</div>
            <div className="chat-message-content">
              {streamingText || <span className="chat-streaming-indicator">Thinking...</span>}
              <span className="chat-streaming-cursor" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          {attachments.length > 0 && (
            <div className="chat-input-attachments">
              {attachments.map((att, i) => (
                <div key={i} className="chat-input-attachment-chip">
                  <FiPaperclip size={11} />
                  <span>{att.name}</span>
                  <button onClick={() => removeAttachment(i)} className="chat-input-attachment-remove">
                    <FiX size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isStreaming}
          />
          <div className="chat-input-toolbar">
            <div className="chat-input-toolbar-left">
              <div className="chat-model-selector" ref={modelSelectorRef}>
                <button
                  className="chat-model-selector-btn"
                  onClick={() => setShowModelSelector(!showModelSelector)}
                >
                  <span>{MODEL_OPTIONS.find(m => m.id === selectedModel)?.label || 'Sonnet 4.6'}</span>
                  <FiChevronDown size={12} />
                </button>
                {showModelSelector && (
                  <div className="chat-model-dropdown">
                    {MODEL_OPTIONS.map((m) => (
                      <button
                        key={m.id}
                        className={`chat-model-option ${selectedModel === m.id ? 'active' : ''}`}
                        onClick={() => { setSelectedModel(m.id); setShowModelSelector(false) }}
                      >
                        <span className="chat-model-option-name">{m.label}</span>
                        <span className="chat-model-option-desc">{m.desc}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="chat-toolbar-btn" onClick={pickAttachment} title="Attach file">
                <FiPaperclip size={14} />
              </button>
              {!project && projects.length > 0 && (
                <div className="chat-input-project-selector">
                  <button
                    className="chat-toolbar-btn"
                    onClick={() => setShowProjectSelector(!showProjectSelector)}
                    title="Attach project context"
                  >
                    <FiFolder size={14} />
                  </button>
                  {showProjectSelector && (
                    <div className="chat-input-project-dropdown">
                      {projects.map((p) => (
                        <button
                          key={p.id}
                          className="chat-input-project-option"
                          onClick={() => { onSetProject(p.id); setShowProjectSelector(false) }}
                        >
                          {isGithubProject(p) ? <FaGithub size={12} /> : <FiFolder size={12} />}
                          <span>{p.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="chat-input-toolbar-right">
              {isStreaming ? (
                <button className="chat-stop-btn" onClick={abortStream} title="Stop generating">
                  <FiSquare size={12} />
                </button>
              ) : (
                <button className="chat-send-btn" onClick={sendMessage} disabled={!input.trim() || (authStatus !== null && !authStatus.authenticated)}>
                  <FiArrowUp size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
