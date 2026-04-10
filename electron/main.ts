import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { execSync, spawn, ChildProcess } from 'node:child_process'
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
  getUserProfile,
  updateUserProfile,
} from './database'

let mainWindow: BrowserWindow | null = null

// ── Active streams (for abort support) ──────────────────────────────
const activeStreams = new Map<string, ChildProcess>()

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

// ── Claude Code Integration ────────────────────────────────────────

/** Read Claude Code OAuth credentials from macOS Keychain */
function readKeychainCredentials(): { accessToken: string; refreshToken?: string; expiresAt?: string } | null {
  if (process.platform !== 'darwin') return null
  try {
    const raw = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w',
      { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim()
    const parsed = JSON.parse(raw)
    // Credentials may be at top level or nested under claudeAiOauth
    const creds = parsed.claudeAiOauth || parsed
    if (creds.accessToken) return creds
    // Some versions store as array of accounts
    if (Array.isArray(creds) && creds.length > 0 && creds[0].accessToken) return creds[0]
    return null
  } catch {
    return null
  }
}

/** Find the Claude CLI binary */
function findClaudeBinary(): string | null {
  const candidates = [
    path.join(process.env.HOME || '', '.local', 'bin', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    path.join(process.env.HOME || '', '.nvm', 'versions', 'node'),  // will be checked differently
  ]

  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
    } catch { /* skip */ }
  }

  // Fallback: use `which`
  try {
    const result = execSync('which claude', { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    if (result && fs.existsSync(result)) return result
  } catch { /* not found */ }

  return null
}

/** Detect authentication status — subscription via keychain only */
function detectClaudeAuth(): { authenticated: boolean; hasBinary: boolean; hasKeychain: boolean; cliBinary: string | null } {
  const cliBinary = findClaudeBinary()
  const keychainCreds = readKeychainCredentials()
  const hasBinary = !!cliBinary
  const hasKeychain = !!keychainCreds
  const authenticated = hasBinary && hasKeychain

  return { authenticated, hasBinary, hasKeychain, cliBinary }
}

/** Map model shorthand to Anthropic model IDs */
function resolveModelId(model: string): string {
  const map: Record<string, string> = {
    sonnet: 'sonnet',
    opus: 'opus',
    haiku: 'haiku',
  }
  return map[model] || model
}

/** Stream chat via Claude CLI subprocess with real-time event parsing */
function streamViaCli(
  streamId: string,
  prompt: string,
  cwd: string | undefined,
  model: string,
  _systemPrompt: string | undefined,
  _conversationHistory: Array<{ role: string; content: string }>,
  win: BrowserWindow,
) {
  const cliBinary = findClaudeBinary()
  if (!cliBinary) {
    win.webContents.send('claude:streamError', { streamId, error: 'Claude CLI not found' })
    return
  }

  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--model', resolveModelId(model),
    '--max-turns', '1',
  ]

  const proc = spawn(cliBinary, args, {
    cwd: cwd || process.env.HOME,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  })

  activeStreams.set(streamId, proc)

  let fullText = ''
  let stdoutBuffer = ''
  let streamEnded = false

  // 16ms IPC batch queue (~60fps)
  let pendingText: string | null = null
  let batchTimer: ReturnType<typeof setTimeout> | null = null

  function flushToRenderer() {
    if (pendingText !== null) {
      win.webContents.send('claude:streamDelta', { streamId, text: pendingText })
      pendingText = null
    }
    batchTimer = null
  }

  function queueDelta(text: string) {
    pendingText = text
    if (!batchTimer) {
      batchTimer = setTimeout(flushToRenderer, 16)
    }
  }

  proc.stdout!.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString()

    // Split on newlines — each JSON event is one line
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() || '' // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue

      try {
        const parsed = JSON.parse(line)

        // Handle stream_event wrapper: {"type":"stream_event","event":{"type":"content_block_delta",...}}
        if (parsed.type === 'stream_event' && parsed.event) {
          const evt = parsed.event

          if (evt.type === 'content_block_delta') {
            if (evt.delta?.type === 'text_delta' && evt.delta.text) {
              fullText += evt.delta.text
              queueDelta(fullText)
            }
            // Skip thinking_delta, signature_delta — we only stream visible text
          } else if (evt.type === 'message_stop') {
            // Flush final text immediately
            if (batchTimer) {
              clearTimeout(batchTimer)
              batchTimer = null
            }
            flushToRenderer()
          }
        }
        // Handle result event — stream is done
        else if (parsed.type === 'result' && !streamEnded) {
          streamEnded = true
          if (batchTimer) {
            clearTimeout(batchTimer)
            batchTimer = null
          }
          flushToRenderer()
          activeStreams.delete(streamId)
          // Use result text if we somehow missed deltas
          const resultText = fullText || parsed.result || ''
          win.webContents.send('claude:streamEnd', { streamId, text: resultText })
        }
      } catch {
        // Not valid JSON — skip
      }
    }
  })

  proc.stderr!.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim()
    if (text && !text.includes('Warning: no stdin data')) {
      console.log('[Claude CLI stderr]', text.slice(0, 200))
    }
  })

  proc.on('close', (code) => {
    if (batchTimer) {
      clearTimeout(batchTimer)
      batchTimer = null
    }
    flushToRenderer()
    if (!streamEnded && activeStreams.has(streamId)) {
      streamEnded = true
      activeStreams.delete(streamId)
      if (code !== 0 && !fullText) {
        win.webContents.send('claude:streamError', { streamId, error: `Claude CLI exited with code ${code}` })
      } else {
        win.webContents.send('claude:streamEnd', { streamId, text: fullText })
      }
    }
  })

  proc.on('error', (err) => {
    if (batchTimer) {
      clearTimeout(batchTimer)
      batchTimer = null
    }
    activeStreams.delete(streamId)
    win.webContents.send('claude:streamError', { streamId, error: err.message })
  })

  // Close stdin so CLI doesn't wait for input
  proc.stdin!.end()
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

// ── User Profile IPC ───────────────────────────────────────────────
const mimeTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' }

function profileWithDataUrl(profile: any) {
  if (!profile?.avatar_path) return profile
  try {
    const ext = path.extname(profile.avatar_path).toLowerCase()
    const mime = mimeTypes[ext] || 'image/png'
    const data = fs.readFileSync(profile.avatar_path)
    return { ...profile, avatar_data_url: `data:${mime};base64,${data.toString('base64')}` }
  } catch {
    return profile
  }
}

ipcMain.handle('profile:get', () => {
  return profileWithDataUrl(getUserProfile())
})

ipcMain.handle('profile:update', (_event, updates: { firstName?: string; lastName?: string; email?: string; avatarPath?: string | null }) => {
  return profileWithDataUrl(updateUserProfile(updates))
})

ipcMain.handle('profile:pickAvatar', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
    title: 'Choose Profile Photo',
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const src = result.filePaths[0]
  const ext = path.extname(src)
  const dest = path.join(app.getPath('userData'), `avatar${ext}`)
  fs.copyFileSync(src, dest)

  return profileWithDataUrl(updateUserProfile({ avatarPath: dest }))
})

// ── File Picker IPC ────────────────────────────────────────────────
ipcMain.handle('dialog:pickFile', async () => {
  if (!mainWindow) return { canceled: true, filePaths: [] }
  return dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
    ],
  })
})

// ── Claude IPC ──────────────────────────────────────────────────────
ipcMain.handle('claude:detectAuth', () => {
  return detectClaudeAuth()
})

ipcMain.handle(
  'claude:chat',
  (
    _event,
    opts: {
      streamId: string
      prompt: string
      model?: string
      systemPrompt?: string
      projectPath?: string
      conversationHistory?: Array<{ role: string; content: string }>
    },
  ) => {
    if (!mainWindow) return
    const auth = detectClaudeAuth()
    const model = opts.model || 'sonnet'
    const history = opts.conversationHistory || []

    if (auth.authenticated) {
      streamViaCli(
        opts.streamId,
        opts.prompt,
        opts.projectPath,
        model,
        opts.systemPrompt,
        history,
        mainWindow,
      )
    } else {
      mainWindow.webContents.send('claude:streamError', {
        streamId: opts.streamId,
        error: auth.hasBinary
          ? 'Claude CLI found but no subscription detected. Sign in with: claude login'
          : 'Claude Code not found. Install it first, then sign in with your subscription.',
      })
    }
  },
)

ipcMain.handle('claude:abort', (_event, streamId: string) => {
  const proc = activeStreams.get(streamId)
  if (proc) {
    proc.kill('SIGTERM')
    activeStreams.delete(streamId)
  }
  return { success: true }
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
