/// <reference types="vite/client" />

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
  }
}
