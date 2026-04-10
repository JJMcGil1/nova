import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import https from 'node:https'
import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  dismissUpdate,
  startAutoUpdatePolling,
  stopAutoUpdatePolling,
} from './auto-updater'
import {
  initDatabase,
  closeDatabase,
  getAllProjects,
  addProject,
  removeProject,
  getAllThreads,
  getThread,
  createThread,
  updateThread,
  deleteThread,
  getMessages,
  addMessage,
  deleteMessage,
} from './database'

let mainWindow: BrowserWindow | null = null

// ── Config persistence (token only — projects moved to SQLite) ──────
const configPath = path.join(app.getPath('userData'), 'nova-config.json')

interface NovaConfig {
  githubToken?: string
}

function readConfig(): NovaConfig {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function writeConfig(config: NovaConfig) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

// ── Migrate old JSON projects to SQLite on first run ────────────────
function migrateProjectsToDb() {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    const old = JSON.parse(raw)
    if (old.projects && Array.isArray(old.projects) && old.projects.length > 0) {
      for (const p of old.projects) {
        addProject({ id: p.id, name: p.name, path: p.path, githubRepo: p.githubRepo })
      }
      // Remove projects from JSON config
      delete old.projects
      fs.writeFileSync(configPath, JSON.stringify(old, null, 2), 'utf-8')
    }
  } catch {
    // No config file or invalid — nothing to migrate
  }
}

// ── GitHub helpers ──────────────────────────────────────────────────
function githubRequest(endpoint: string, token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      `https://api.github.com${endpoint}`,
      {
        headers: {
          'User-Agent': 'Nova-App',
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data))
          } else {
            reject(new Error(`GitHub API ${res.statusCode}: ${data}`))
          }
        })
      },
    )
    req.on('error', reject)
  })
}

// ── Window ──────────────────────────────────────────────────────────
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

// ── Auto-updater IPC ────────────────────────────────────────────────
ipcMain.handle('updater:checkForUpdates', () => checkForUpdates())
ipcMain.handle('updater:downloadUpdate', () => downloadUpdate())
ipcMain.handle('updater:installUpdate', () => installUpdate())
ipcMain.handle('updater:dismissUpdate', () => dismissUpdate())

// ── Settings IPC ────────────────────────────────────────────────────
ipcMain.handle('settings:getConfig', () => {
  const config = readConfig()
  return {
    hasToken: !!config.githubToken,
    tokenHint: config.githubToken ? `ghp_...${config.githubToken.slice(-4)}` : '',
    projects: getAllProjects(),
  }
})

ipcMain.handle('settings:setGithubToken', async (_event, token: string) => {
  try {
    const user = await githubRequest('/user', token)
    const config = readConfig()
    config.githubToken = token
    writeConfig(config)
    return { success: true, username: user.login, avatarUrl: user.avatar_url }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('settings:removeGithubToken', () => {
  const config = readConfig()
  delete config.githubToken
  writeConfig(config)
  return { success: true }
})

ipcMain.handle('settings:getGithubUser', async () => {
  const config = readConfig()
  if (!config.githubToken) return null
  try {
    const user = await githubRequest('/user', config.githubToken)
    return { username: user.login, avatarUrl: user.avatar_url }
  } catch {
    return null
  }
})

ipcMain.handle('settings:listGithubRepos', async () => {
  const config = readConfig()
  if (!config.githubToken) return []
  try {
    const repos = await githubRequest('/user/repos?per_page=100&sort=updated', config.githubToken)
    return repos.map((r: any) => ({
      fullName: r.full_name,
      name: r.name,
      owner: r.owner.login,
      private: r.private,
      description: r.description,
      updatedAt: r.updated_at,
    }))
  } catch {
    return []
  }
})

// ── Projects IPC (now backed by SQLite) ─────────────────────────────
ipcMain.handle('settings:pickFolder', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Folder',
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const folderPath = result.filePaths[0]
  const name = path.basename(folderPath)
  return { path: folderPath, name }
})

ipcMain.handle('settings:addProject', (_event, project: { id: string; name: string; path?: string; githubRepo?: string }) => {
  return addProject(project)
})

ipcMain.handle('settings:removeProject', (_event, projectId: string) => {
  return removeProject(projectId)
})

// ── Threads IPC ─────────────────────────────────────────────────────
ipcMain.handle('db:getAllThreads', () => {
  return getAllThreads()
})

ipcMain.handle('db:getThread', (_event, id: string) => {
  return getThread(id)
})

ipcMain.handle('db:createThread', (_event, thread: { id: string; title: string; projectId?: string }) => {
  return createThread(thread)
})

ipcMain.handle('db:updateThread', (_event, id: string, updates: { title?: string; projectId?: string | null }) => {
  return updateThread(id, updates)
})

ipcMain.handle('db:deleteThread', (_event, id: string) => {
  return deleteThread(id)
})

// ── Messages IPC ────────────────────────────────────────────────────
ipcMain.handle('db:getMessages', (_event, threadId: string) => {
  return getMessages(threadId)
})

ipcMain.handle('db:addMessage', (_event, message: { id: string; threadId: string; role: string; content: string }) => {
  return addMessage(message)
})

ipcMain.handle('db:deleteMessage', (_event, id: string) => {
  return deleteMessage(id)
})

// ── App lifecycle ───────────────────────────────────────────────────
app.whenReady().then(() => {
  // Initialize database before anything else
  initDatabase()
  migrateProjectsToDb()

  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, '../build/icon.png'))
  }
  createWindow()

  if (!process.env.VITE_DEV_SERVER_URL) {
    startAutoUpdatePolling()
  }
})

app.on('window-all-closed', () => {
  stopAutoUpdatePolling()
  closeDatabase()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
