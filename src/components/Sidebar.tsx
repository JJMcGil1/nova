interface Chat {
  id: string
  title: string
}

interface SidebarProps {
  activeChat: string
  onSelectChat: (id: string) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

const mockChats: Chat[] = [
  { id: 'default', title: 'Welcome to Nova' },
]

export default function Sidebar({ activeChat, onSelectChat, collapsed, onToggleCollapse }: SidebarProps) {
  return (
    <div className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && <span className="sidebar-label">Chats</span>}
        <button className="sidebar-toggle" onClick={onToggleCollapse}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d={collapsed ? 'M6 3L11 8L6 13' : 'M10 3L5 8L10 13'}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <button className="sidebar-new-chat" onClick={() => onSelectChat('default')}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {!collapsed && <span>New Chat</span>}
      </button>
      <div className="sidebar-chats">
        {mockChats.map((chat) => (
          <button
            key={chat.id}
            className={`sidebar-chat-item ${activeChat === chat.id ? 'active' : ''}`}
            onClick={() => onSelectChat(chat.id)}
          >
            {!collapsed && chat.title}
          </button>
        ))}
      </div>
    </div>
  )
}
