import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  dismissUpdate,
  startAutoUpdatePolling,
  stopAutoUpdatePolling,
} from './auto-updater'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

// Auto-updater IPC handlers
ipcMain.handle('updater:checkForUpdates', () => checkForUpdates())
ipcMain.handle('updater:downloadUpdate', () => downloadUpdate())
ipcMain.handle('updater:installUpdate', () => installUpdate())
ipcMain.handle('updater:dismissUpdate', () => dismissUpdate())

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, '../build/icon.png'))
  }
  createWindow()

  // Start auto-update polling in production only
  if (!process.env.VITE_DEV_SERVER_URL) {
    startAutoUpdatePolling()
  }
})

app.on('window-all-closed', () => {
  stopAutoUpdatePolling()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
