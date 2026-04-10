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
})
