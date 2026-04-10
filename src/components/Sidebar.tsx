import { useState } from 'react'
import { FiPlus, FiChevronLeft, FiChevronRight, FiFolder, FiMessageSquare, FiTrash2 } from 'react-icons/fi'
import { FaGithub } from 'react-icons/fa'

interface SidebarProps {
  threads: NovaThread[]
  activeThread: string
  onSelectThread: (id: string) => void
  onNewChat: (projectId?: string) => void
  onDeleteThread: (id: string) => void
  collapsed: boolean
  onToggleCollapse: () => void
  projects: NovaProject[]
}

export default function Sidebar({
  threads,
  activeThread,
  onSelectThread,
  onNewChat,
  onDeleteThread,
  collapsed,
  onToggleCollapse,
  projects,
}: SidebarProps) {
  const [showProjectPicker, setShowProjectPicker] = useState(false)

  const getProjectForThread = (thread: NovaThread) =>
    thread.project_id ? projects.find((p) => p.id === thread.project_id) : undefined

  return (
    <div className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && <span className="sidebar-label">Chats</span>}
        <button className="sidebar-toggle" onClick={onToggleCollapse}>
          {collapsed ? <FiChevronRight size={16} /> : <FiChevronLeft size={16} />}
        </button>
      </div>

      <div className="sidebar-new-chat-wrapper">
        <button className="sidebar-new-chat" onClick={() => {
          if (projects.length > 0) {
            setShowProjectPicker(!showProjectPicker)
          } else {
            onNewChat()
          }
        }}>
          <FiPlus size={14} />
          {!collapsed && <span>New Chat</span>}
        </button>

        {showProjectPicker && !collapsed && (
          <div className="sidebar-project-picker">
            <button
              className="sidebar-project-picker-item"
              onClick={() => { onNewChat(); setShowProjectPicker(false) }}
            >
              <span className="sidebar-project-picker-icon">
                <FiMessageSquare size={12} />
              </span>
              <span>General Chat</span>
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                className="sidebar-project-picker-item"
                onClick={() => { onNewChat(project.id); setShowProjectPicker(false) }}
              >
                <span className="sidebar-project-picker-icon">
                  {(project.githubRepo || project.github_repo)
                    ? <FaGithub size={12} />
                    : <FiFolder size={12} />}
                </span>
                <span>{project.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-chats">
        {threads.map((thread) => {
          const project = getProjectForThread(thread)
          return (
            <div
              key={thread.id}
              className={`sidebar-chat-item ${activeThread === thread.id ? 'active' : ''}`}
            >
              <button
                className="sidebar-chat-item-main"
                onClick={() => onSelectThread(thread.id)}
              >
                {!collapsed && (
                  <div className="sidebar-chat-item-content">
                    <span className="sidebar-chat-item-title">{thread.title}</span>
                    {project && (
                      <span className="sidebar-chat-item-project">
                        {(project.githubRepo || project.github_repo)
                          ? <FaGithub size={10} />
                          : <FiFolder size={10} />}
                        {project.name}
                      </span>
                    )}
                  </div>
                )}
              </button>
              {!collapsed && activeThread === thread.id && (
                <button
                  className="sidebar-chat-item-delete"
                  onClick={(e) => { e.stopPropagation(); onDeleteThread(thread.id) }}
                  title="Delete thread"
                >
                  <FiTrash2 size={12} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
