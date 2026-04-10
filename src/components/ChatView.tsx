import { useState, useRef, useEffect, useCallback, memo } from 'react'
import { FiFolder, FiX, FiArrowUp, FiSquare, FiPaperclip, FiChevronDown, FiZap, FiCpu, FiStar } from 'react-icons/fi'
import { FaGithub } from 'react-icons/fa'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

/**
 * Smooth text reveal hook.
 * Reveals targetText at a steady velocity, tracking incoming chunk speed.
 * When isActive goes false, immediately returns the full targetText (no drain).
 */
function useSmoothReveal(targetText: string, isActive: boolean) {
  const [displayText, setDisplayText] = useState('')
  const displayRef = useRef('')
  const targetRef = useRef('')
  const lastTimeRef = useRef(0)
  const velocityRef = useRef(0)
  const prevTargetLenRef = useRef(0)

  // Track target and velocity
  useEffect(() => {
    targetRef.current = targetText
    const now = performance.now()
    const newChars = targetText.length - prevTargetLenRef.current
    if (newChars > 0 && prevTargetLenRef.current > 0) {
      const dt = now - lastTimeRef.current
      if (dt > 0) {
        const instantVelocity = newChars / dt
        velocityRef.current = velocityRef.current === 0
          ? instantVelocity
          : velocityRef.current * 0.7 + instantVelocity * 0.3
      }
    }
    prevTargetLenRef.current = targetText.length
    lastTimeRef.current = now
  }, [targetText])

  // Animation loop — only runs while isActive
  useEffect(() => {
    if (!isActive) {
      // Stream ended — reset for next stream
      displayRef.current = ''
      setDisplayText('')
      velocityRef.current = 0
      prevTargetLenRef.current = 0
      return
    }

    displayRef.current = ''
    setDisplayText('')
    velocityRef.current = 0
    prevTargetLenRef.current = 0

    let cancelled = false
    let prevFrameTime = performance.now()

    function tick(now: number) {
      if (cancelled) return

      const target = targetRef.current
      const currentLen = displayRef.current.length
      const remaining = target.length - currentLen

      if (remaining > 0) {
        const frameDt = now - prevFrameTime
        prevFrameTime = now

        let charsToReveal: number
        if (remaining > 500) {
          charsToReveal = Math.ceil(remaining * 0.15)
        } else if (velocityRef.current > 0) {
          const idealChars = velocityRef.current * frameDt * 0.85
          charsToReveal = Math.max(1, Math.round(idealChars))
          if (remaining > 100) {
            charsToReveal = Math.max(charsToReveal, Math.ceil(remaining * 0.08))
          }
        } else {
          charsToReveal = Math.max(1, Math.ceil(remaining * 0.1))
        }

        const nextLen = Math.min(currentLen + charsToReveal, target.length)
        displayRef.current = target.slice(0, nextLen)
        setDisplayText(displayRef.current)
      }

      requestAnimationFrame(tick)
    }

    const raf = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [isActive])

  // While streaming, return the smoothly revealed text.
  // When not streaming, return nothing (the final message is in messages[] now).
  return displayText
}

const MODEL_OPTIONS = [
  { id: 'sonnet', label: 'Sonnet 4.6', desc: 'Fast & capable', icon: FiZap },
  { id: 'opus', label: 'Opus 4.6', desc: 'Most intelligent', icon: FiStar },
  { id: 'haiku', label: 'Haiku 4.5', desc: 'Fastest', icon: FiCpu },
] as const

interface ChatViewProps {
  threadId: string
  project?: NovaProject
  projects: NovaProject[]
  onSetProject: (projectId: string | undefined) => void
}

// Memoized markdown renderer to avoid re-parsing unchanged messages
const MarkdownContent = memo(({ content }: { content: string }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
    {content}
  </ReactMarkdown>
))
MarkdownContent.displayName = 'MarkdownContent'

// Memoized message component — only re-renders when its own content changes
const ChatMessage = memo(({ msg, skipAnimation }: { msg: NovaMessage; skipAnimation?: boolean }) => (
  <div className={`chat-message chat-message-${msg.role}${skipAnimation ? '' : ' chat-message-enter'}`}>
    <div className="chat-message-avatar">
      {msg.role === 'assistant' ? '✦' : msg.role === 'system' ? '!' : ''}
    </div>
    <div className="chat-message-content">
      {msg.role === 'assistant' ? (
        <MarkdownContent content={msg.content} />
      ) : (
        msg.content
      )}
    </div>
  </div>
))
ChatMessage.displayName = 'ChatMessage'

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
  const [inputFocused, setInputFocused] = useState(false)
  const modelSelectorRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const activeStreamId = useRef<string | null>(null)
  const lastStreamedMsgId = useRef<string | null>(null)

  const userScrolledUp = useRef(false)

  // Smooth character-by-character reveal of streaming text
  const displayedStreamText = useSmoothReveal(streamingText, isStreaming)

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
    setIsStreaming(false)
    setStreamingText('')
    activeStreamId.current = null
    userScrolledUp.current = false
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
        activeStreamId.current = null

        const finalText = text || ''
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

        lastStreamedMsgId.current = msgId
        // Add message immediately — no drain animation needed
        setMessages((prev) => [...prev, assistantMsg])
        setIsStreaming(false)
        setStreamingText('')
        userScrolledUp.current = false
      }
    })

    const unsubError = claude.onStreamError(({ streamId, error }) => {
      if (streamId === activeStreamId.current) {
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

  // Smart auto-scroll — only if user hasn't scrolled up
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      // User is "scrolled up" if more than 80px from bottom
      userScrolledUp.current = scrollHeight - scrollTop - clientHeight > 80
    }
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (!userScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, displayedStreamText])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 240) + 'px'
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

    await api.addMessage({
      id: userMsg.id,
      threadId,
      role: 'user',
      content: text,
    })

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    userScrolledUp.current = false

    const allMsgs = [...messages, userMsg]
    const conversationHistory = allMsgs
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }))

    let systemPrompt: string | undefined
    if (project) {
      const repoInfo = project.githubRepo || project.github_repo
      systemPrompt = `You are Nova, a helpful AI assistant. The user is working in the project "${project.name}"${repoInfo ? ` (GitHub: ${repoInfo})` : ''}${project.path ? ` located at ${project.path}` : ''}.`
    }

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
      conversationHistory: conversationHistory.slice(0, -1),
    })
    setAttachments([])
  }, [input, threadId, isStreaming, messages, project, selectedModel])

  const abortStream = useCallback(async () => {
    if (activeStreamId.current) {
      await window.electronAPI?.claude?.abort(activeStreamId.current)
      setIsStreaming(false)

      if (streamingText) {
        const finalContent = streamingText
        const msgId = (Date.now() + 1).toString()
        const partialMsg: NovaMessage = {
          id: msgId,
          thread_id: threadId,
          role: 'assistant',
          content: finalContent + '\n\n*(response interrupted)*',
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
      : 'What can I help you with?'

  const isGithubProject = (p: NovaProject) => !!(p.githubRepo || p.github_repo)
  const currentModel = MODEL_OPTIONS.find(m => m.id === selectedModel) || MODEL_OPTIONS[0]
  const ModelIcon = currentModel.icon
  const isEmpty = messages.length === 0 && !isStreaming

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

      <div className="chat-messages" ref={messagesContainerRef}>
        {isEmpty && (
          <div className="chat-empty-state">
            <div className="chat-empty-glyph">✦</div>
            <h2 className="chat-empty-title">Nova</h2>
            <p className="chat-empty-subtitle">How can I help you today?</p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} msg={msg} skipAnimation={msg.id === lastStreamedMsgId.current} />
        ))}
        {(isStreaming || displayedStreamText) && (
          <div className="chat-message chat-message-assistant chat-message-enter">
            <div className="chat-message-avatar">✦</div>
            <div className="chat-message-content chat-message-streaming">
              {displayedStreamText ? (
                <MarkdownContent content={displayedStreamText} />
              ) : (
                <span className="chat-streaming-indicator">Thinking...</span>
              )}
              {isStreaming && <span className="chat-streaming-cursor" />}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <div className={`chat-composer${inputFocused ? ' focused' : ''}`}>
          {attachments.length > 0 && (
            <div className="chat-composer-attachments">
              {attachments.map((att, i) => (
                <div key={i} className="chat-attachment-chip">
                  <FiPaperclip size={11} />
                  <span>{att.name}</span>
                  <button onClick={() => removeAttachment(i)} className="chat-attachment-remove">
                    <FiX size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            className="chat-composer-input"
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            rows={2}
            disabled={isStreaming}
          />

          <div className="chat-composer-toolbar">
            <div className="chat-composer-actions">
              <div className="chat-model-selector" ref={modelSelectorRef}>
                <button
                  className="chat-model-pill"
                  onClick={() => setShowModelSelector(!showModelSelector)}
                >
                  <ModelIcon size={12} />
                  <span>{currentModel.label}</span>
                  <FiChevronDown size={11} className={`chat-model-chevron${showModelSelector ? ' open' : ''}`} />
                </button>
                {showModelSelector && (
                  <div className="chat-model-dropdown">
                    {MODEL_OPTIONS.map((m) => {
                      const Icon = m.icon
                      return (
                        <button
                          key={m.id}
                          className={`chat-model-option ${selectedModel === m.id ? 'active' : ''}`}
                          onClick={() => { setSelectedModel(m.id); setShowModelSelector(false) }}
                        >
                          <div className="chat-model-option-icon">
                            <Icon size={13} />
                          </div>
                          <div className="chat-model-option-text">
                            <span className="chat-model-option-name">{m.label}</span>
                            <span className="chat-model-option-desc">{m.desc}</span>
                          </div>
                          {selectedModel === m.id && (
                            <div className="chat-model-option-check">&#10003;</div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="chat-composer-divider" />

              <button className="chat-composer-btn" onClick={pickAttachment} title="Attach file">
                <FiPaperclip size={15} />
              </button>

              {!project && projects.length > 0 && (
                <div className="chat-input-project-selector">
                  <button
                    className="chat-composer-btn"
                    onClick={() => setShowProjectSelector(!showProjectSelector)}
                    title="Attach project context"
                  >
                    <FiFolder size={15} />
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

            <div className="chat-composer-send">
              {isStreaming ? (
                <button className="chat-stop-btn" onClick={abortStream} title="Stop generating">
                  <FiSquare size={12} />
                </button>
              ) : (
                <button
                  className="chat-send-btn"
                  onClick={sendMessage}
                  disabled={!input.trim() || (authStatus !== null && !authStatus.authenticated)}
                >
                  <FiArrowUp size={20} strokeWidth={3} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
