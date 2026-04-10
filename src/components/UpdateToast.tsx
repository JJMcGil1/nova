import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

type UpdateState = 'hidden' | 'available' | 'downloading' | 'installing' | 'error'

interface UpdateInfo {
  version?: string
  releaseNotes?: string
  percent?: number
  message?: string
}

export default function UpdateToast() {
  const [state, setState] = useState<UpdateState>('hidden')
  const [info, setInfo] = useState<UpdateInfo>({})

  useEffect(() => {
    const updater = window.electronAPI?.updater
    if (!updater) return

    const unsubs: (() => void)[] = []

    unsubs.push(updater.onUpdateAvailable((data) => {
      setInfo({ version: data.version, releaseNotes: data.releaseNotes })
      setState('available')
    }))

    unsubs.push(updater.onDownloadProgress((data) => {
      setInfo(prev => ({ ...prev, percent: data.percent }))
      setState('downloading')
    }))

    unsubs.push(updater.onUpdateDownloaded(() => {
      setState('installing')
      // Auto-install after download
      updater.installUpdate()
    }))

    unsubs.push(updater.onUpdateError((data) => {
      setInfo(prev => ({ ...prev, message: data.message }))
      setState('error')
    }))

    return () => unsubs.forEach(fn => fn())
  }, [])

  if (state === 'hidden') return null

  const handleDownload = () => {
    window.electronAPI?.updater?.downloadUpdate()
    setState('downloading')
    setInfo(prev => ({ ...prev, percent: 0 }))
  }

  const handleDismiss = () => {
    window.electronAPI?.updater?.dismissUpdate()
    setState('hidden')
    setInfo({})
  }

  const handleRetry = () => {
    window.electronAPI?.updater?.downloadUpdate()
    setState('downloading')
    setInfo(prev => ({ ...prev, percent: 0, message: undefined }))
  }

  const toast = (
    <div className="update-toast">
      {state === 'available' && (
        <>
          <div className="update-toast-content">
            <svg className="update-toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v10M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>Nova {info.version} is available</span>
          </div>
          <div className="update-toast-actions">
            <button className="update-toast-btn update-toast-btn-secondary" onClick={handleDismiss}>Later</button>
            <button className="update-toast-btn update-toast-btn-primary" onClick={handleDownload}>Download</button>
          </div>
        </>
      )}

      {state === 'downloading' && (
        <>
          <div className="update-toast-content">
            <div className="update-toast-spinner" />
            <span>Downloading... {info.percent ?? 0}%</span>
          </div>
          <div className="update-toast-progress">
            <div className="update-toast-progress-bar" style={{ width: `${info.percent ?? 0}%` }} />
          </div>
        </>
      )}

      {state === 'installing' && (
        <div className="update-toast-content">
          <div className="update-toast-spinner" />
          <span>Restarting Nova...</span>
        </div>
      )}

      {state === 'error' && (
        <>
          <div className="update-toast-content">
            <svg className="update-toast-icon update-toast-icon-error" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>{info.message || 'Update failed'}</span>
          </div>
          <div className="update-toast-actions">
            <button className="update-toast-btn update-toast-btn-secondary" onClick={handleDismiss}>Dismiss</button>
            <button className="update-toast-btn update-toast-btn-primary" onClick={handleRetry}>Retry</button>
          </div>
        </>
      )}
    </div>
  )

  return createPortal(toast, document.body)
}
