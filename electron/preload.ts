import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  version: process.env.npm_package_version || 'dev',
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),
    downloadUpdate: () => ipcRenderer.invoke('updater:downloadUpdate'),
    installUpdate: () => ipcRenderer.invoke('updater:installUpdate'),
    dismissUpdate: () => ipcRenderer.invoke('updater:dismissUpdate'),
    onUpdateAvailable: (cb: (data: any) => void) => {
      const handler = (_event: any, data: any) => cb(data)
      ipcRenderer.on('updater:onUpdateAvailable', handler)
      return () => ipcRenderer.removeListener('updater:onUpdateAvailable', handler)
    },
    onDownloadProgress: (cb: (data: any) => void) => {
      const handler = (_event: any, data: any) => cb(data)
      ipcRenderer.on('updater:onDownloadProgress', handler)
      return () => ipcRenderer.removeListener('updater:onDownloadProgress', handler)
    },
    onUpdateDownloaded: (cb: (data: any) => void) => {
      const handler = (_event: any, data: any) => cb(data)
      ipcRenderer.on('updater:onUpdateDownloaded', handler)
      return () => ipcRenderer.removeListener('updater:onUpdateDownloaded', handler)
    },
    onUpdateError: (cb: (data: any) => void) => {
      const handler = (_event: any, data: any) => cb(data)
      ipcRenderer.on('updater:onUpdateError', handler)
      return () => ipcRenderer.removeListener('updater:onUpdateError', handler)
    },
  },
  settings: {
    getConfig: () => ipcRenderer.invoke('settings:getConfig'),
    setGithubToken: (token: string) => ipcRenderer.invoke('settings:setGithubToken', token),
    removeGithubToken: () => ipcRenderer.invoke('settings:removeGithubToken'),
    getGithubUser: () => ipcRenderer.invoke('settings:getGithubUser'),
    listGithubRepos: () => ipcRenderer.invoke('settings:listGithubRepos'),
    pickFolder: () => ipcRenderer.invoke('settings:pickFolder'),
    addProject: (project: any) => ipcRenderer.invoke('settings:addProject', project),
    removeProject: (projectId: string) => ipcRenderer.invoke('settings:removeProject', projectId),
  },
  db: {
    getAllThreads: () => ipcRenderer.invoke('db:getAllThreads'),
    getThread: (id: string) => ipcRenderer.invoke('db:getThread', id),
    createThread: (thread: { id: string; title: string; projectId?: string }) =>
      ipcRenderer.invoke('db:createThread', thread),
    updateThread: (id: string, updates: { title?: string; projectId?: string | null }) =>
      ipcRenderer.invoke('db:updateThread', id, updates),
    deleteThread: (id: string) => ipcRenderer.invoke('db:deleteThread', id),
    getMessages: (threadId: string) => ipcRenderer.invoke('db:getMessages', threadId),
    addMessage: (message: { id: string; threadId: string; role: string; content: string }) =>
      ipcRenderer.invoke('db:addMessage', message),
    deleteMessage: (id: string) => ipcRenderer.invoke('db:deleteMessage', id),
  },
})
