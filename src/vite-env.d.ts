/// <reference types="vite/client" />

interface NovaProject {
  id: string
  name: string
  path?: string
  github_repo?: string
  githubRepo?: string
  created_at?: string
  updated_at?: string
}

interface NovaThread {
  id: string
  title: string
  project_id?: string
  created_at: string
  updated_at: string
}

interface NovaMessage {
  id: string
  thread_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

interface GithubRepo {
  fullName: string
  name: string
  owner: string
  private: boolean
  description: string | null
  updatedAt: string
}

interface Window {
  electronAPI: {
    version?: string
    updater?: {
      checkForUpdates: () => Promise<boolean>
      downloadUpdate: () => Promise<boolean>
      installUpdate: () => Promise<void>
      dismissUpdate: () => void
      onUpdateAvailable: (cb: (data: { version: string; releaseNotes: string; releaseDate: string }) => void) => () => void
      onDownloadProgress: (cb: (data: { percent: number; transferred: number; total: number }) => void) => () => void
      onUpdateDownloaded: (cb: (data: { version: string }) => void) => () => void
      onUpdateError: (cb: (data: { message: string }) => void) => () => void
    }
    settings?: {
      getConfig: () => Promise<{ hasToken: boolean; tokenHint: string; projects: NovaProject[] }>
      setGithubToken: (token: string) => Promise<{ success: boolean; username?: string; avatarUrl?: string; error?: string }>
      removeGithubToken: () => Promise<{ success: boolean }>
      getGithubUser: () => Promise<{ username: string; avatarUrl: string } | null>
      listGithubRepos: () => Promise<GithubRepo[]>
      pickFolder: () => Promise<{ path: string; name: string } | null>
      addProject: (project: NovaProject) => Promise<NovaProject[]>
      removeProject: (projectId: string) => Promise<NovaProject[]>
    }
    db?: {
      getAllThreads: () => Promise<NovaThread[]>
      getThread: (id: string) => Promise<NovaThread | undefined>
      createThread: (thread: { id: string; title: string; projectId?: string }) => Promise<NovaThread>
      updateThread: (id: string, updates: { title?: string; projectId?: string | null }) => Promise<NovaThread>
      deleteThread: (id: string) => Promise<NovaThread[]>
      getMessages: (threadId: string) => Promise<NovaMessage[]>
      addMessage: (message: { id: string; threadId: string; role: string; content: string }) => Promise<NovaMessage>
      deleteMessage: (id: string) => Promise<void>
    }
  }
}
