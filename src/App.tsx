import { useState, useEffect } from 'react'
import Titlebar from './components/Titlebar'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import UpdateToast from './components/UpdateToast'

type Theme = 'dark' | 'light'

export default function App() {
  const [activeChat, setActiveChat] = useState<string>('default')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('nova-theme') as Theme) || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('nova-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return (
    <div className="app">
      <Titlebar theme={theme} onToggleTheme={toggleTheme} />
      <div className="app-body">
        <Sidebar
          activeChat={activeChat}
          onSelectChat={setActiveChat}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <ChatView chatId={activeChat} />
      </div>
      <UpdateToast />
    </div>
  )
}
