import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls removed — using native macOS traffic lights
})
