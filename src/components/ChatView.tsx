import { useState, useRef, useEffect } from 'react'
import { FiFolder, FiX, FiArrowUp } from 'react-icons/fi'
import { FaGithub } from 'react-icons/fa'

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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
  }, [threadId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [input])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || !threadId) return

    const api = window.electronAPI?.db
    if (!api) return

    const userMsg: NovaMessage = {
      id: Date.now().toString(),
      thread_id: threadId,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }

    // Persist to DB
    await api.addMessage({
      id: userMsg.id,
      threadId,
      role: 'user',
      content: text,
    })

    setMessages((prev) => [...prev, userMsg])
    setInput('')

    // Simulated assistant response
    setTimeout(async () => {
      const projectContext = project
        ? `I'm working in the context of **${project.name}**${(project.githubRepo || project.github_repo) ? ` (${project.githubRepo || project.github_repo})` : ''}${project.path ? ` at \`${project.path}\`` : ''}. `
        : ''
      const assistantMsg: NovaMessage = {
        id: (Date.now() + 1).toString(),
        thread_id: threadId,
        role: 'assistant',
        content: `${projectContext}This is a placeholder response. Nova will be connected to an AI backend soon.`,
        created_at: new Date().toISOString(),
      }

      await api.addMessage({
        id: assistantMsg.id,
        threadId,
        role: 'assistant',
        content: assistantMsg.content,
      })

      setMessages((prev) => [...prev, assistantMsg])
    }, 600)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const placeholder = project
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
              {msg.role === 'assistant' ? '✦' : ''}
            </div>
            <div className="chat-message-content">{msg.content}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          {!project && projects.length > 0 && (
            <div className="chat-input-project-selector">
              <button
                className="chat-input-project-btn"
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
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button className="chat-send-btn" onClick={sendMessage} disabled={!input.trim()}>
            <FiArrowUp size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
