import { useState, useEffect } from 'react'
import Titlebar from './components/Titlebar'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import Settings from './components/Settings'
import UpdateToast from './components/UpdateToast'

type Theme = 'dark' | 'light'
type View = 'chat' | 'settings'

export default function App() {
  const [threads, setThreads] = useState<NovaThread[]>([])
  const [activeThread, setActiveThread] = useState<string>('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [view, setView] = useState<View>('chat')
  const [projects, setProjects] = useState<NovaProject[]>([])
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('nova-theme') as Theme) || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('nova-theme', theme)
  }, [theme])

  // Load data on mount
  useEffect(() => {
    const load = async () => {
      const api = window.electronAPI
      if (!api) return

      // Load projects
      const config = await api.settings?.getConfig()
      if (config) setProjects(config.projects)

      // Load user profile
      const profile = await api.profile?.get()
      if (profile) setUserProfile(profile)

      // Load threads from DB
      const dbThreads = await api.db?.getAllThreads()
      if (dbThreads && dbThreads.length > 0) {
        setThreads(dbThreads)
        setActiveThread(dbThreads[0].id)
      } else {
        // Create a default welcome thread
        const id = Date.now().toString()
        const thread = await api.db?.createThread({ id, title: 'Welcome to Nova' })
        if (thread) {
          // Add the welcome message
          await api.db?.addMessage({
            id: `${id}-welcome`,
            threadId: id,
            role: 'assistant',
            content: "Hey! I'm Nova. How can I help you today?",
          })
          setThreads([thread])
          setActiveThread(thread.id)
        }
      }
    }
    load()
  }, [])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  const currentThread = threads.find((t) => t.id === activeThread)
  const currentProject = currentThread?.project_id
    ? projects.find((p) => p.id === currentThread.project_id)
    : undefined

  const handleNewChat = async (projectId?: string) => {
    const api = window.electronAPI?.db
    if (!api) return

    const project = projectId ? projects.find((p) => p.id === projectId) : undefined
    const id = Date.now().toString()
    const title = project ? project.name : 'New Chat'

    const thread = await api.createThread({ id, title, projectId })
    if (thread) {
      setThreads((prev) => [thread, ...prev])
      setActiveThread(thread.id)
      setView('chat')
    }
  }

  const handleSetChatProject = async (threadId: string, projectId: string | undefined) => {
    const api = window.electronAPI?.db
    if (!api) return

    await api.updateThread(threadId, { projectId: projectId ?? null })
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, project_id: projectId } : t)),
    )
  }

  const handleDeleteThread = async (threadId: string) => {
    const api = window.electronAPI?.db
    if (!api) return

    const remaining = await api.deleteThread(threadId)
    setThreads(remaining)
    if (activeThread === threadId) {
      setActiveThread(remaining.length > 0 ? remaining[0].id : '')
    }
  }

  return (
    <div className="app">
      <Titlebar
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <div className="app-body">
        <Sidebar
          threads={threads}
          activeThread={activeThread}
          onSelectThread={(id) => { setActiveThread(id); setView('chat') }}
          onNewChat={handleNewChat}
          onDeleteThread={handleDeleteThread}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          projects={projects}
          onOpenSettings={() => setView(view === 'settings' ? 'chat' : 'settings')}
          settingsActive={view === 'settings'}
          userProfile={userProfile}
        />
        {view === 'settings' ? (
          <Settings
            projects={projects}
            onProjectsChange={setProjects}
            onClose={() => setView('chat')}
            userProfile={userProfile}
            onProfileChange={setUserProfile}
          />
        ) : (
          <ChatView
            threadId={activeThread}
            project={currentProject}
            projects={projects}
            onSetProject={(projectId) => handleSetChatProject(activeThread, projectId)}
          />
        )}
      </div>
      <UpdateToast />
    </div>
  )
}
