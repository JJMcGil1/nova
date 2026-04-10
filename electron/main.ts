import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import https from 'node:https'
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
} from './database'

let mainWindow: BrowserWindow | null = null

// ── Active Claude CLI processes (for abort support) ─────────────────
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

/** Stream chat via Claude CLI subprocess */
function streamViaCli(
  streamId: string,
  prompt: string,
  cwd: string | undefined,
  model: string,
  systemPrompt: string | undefined,
  conversationHistory: Array<{ role: string; content: string }>,
  win: BrowserWindow,
) {
  const cliBinary = findClaudeBinary()
  if (!cliBinary) {
    win.webContents.send('claude:streamError', { streamId, error: 'Claude CLI binary not found' })
    return
  }

  // Build the full prompt with conversation history for context
  let fullPrompt = ''
  if (systemPrompt) {
    fullPrompt += `${systemPrompt}\n\n`
  }
  // Include recent conversation history
  for (const msg of conversationHistory) {
    const prefix = msg.role === 'user' ? 'Human' : 'Assistant'
    fullPrompt += `${prefix}: ${msg.content}\n\n`
  }
  fullPrompt += `Human: ${prompt}\n\nAssistant:`

  const args = [
    '-p', fullPrompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--model', model,
    '--max-turns', '200',
    '--no-session-persistence',
  ]

  // Strip CLAUDE_CODE_* env vars to prevent nesting detection
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('CLAUDE_CODE_')) delete env[key]
  }
  // Ensure the CLI doesn't think it's nested
  delete env.CLAUDE_CODE
  delete env.CLAUDE_CODE_ENTRYPOINT

  const child = spawn(cliBinary, args, {
    cwd: cwd || process.env.HOME,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  activeStreams.set(streamId, child)

  let fullText = ''
  let buffer = ''

  child.stdout?.on('data', (data: Buffer) => {
    buffer += data.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() || '' // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)

        // Handle different event types from Claude CLI stream-json output
        if (event.type === 'assistant' && event.message) {
          // Full message event - extract text from content blocks
          const text = extractTextFromContent(event.message.content)
          if (text && text !== fullText) {
            fullText = text
            win.webContents.send('claude:streamDelta', { streamId, text: fullText })
          }
        } else if (event.type === 'content_block_delta') {
          // Incremental delta
          if (event.delta?.text) {
            fullText += event.delta.text
            win.webContents.send('claude:streamDelta', { streamId, text: fullText })
          }
        } else if (event.type === 'message_start' || event.type === 'content_block_start') {
          // Stream started - no action needed
        } else if (event.type === 'message_stop' || event.type === 'message_delta') {
          // May contain stop reason
        } else if (event.type === 'result') {
          // Final result from CLI
          const text = extractTextFromResult(event)
          if (text) {
            fullText = text
            win.webContents.send('claude:streamDelta', { streamId, text: fullText })
          }
        }
      } catch {
        // Not valid JSON - might be partial line or plain text output
        // Some CLI versions output plain text
      }
    }
  })

  child.stderr?.on('data', (data: Buffer) => {
    const text = data.toString()
    // Ignore verbose/debug output, only forward actual errors
    if (text.includes('Error') || text.includes('error')) {
      console.error('[Claude CLI stderr]', text)
    }
  })

  child.on('close', (code) => {
    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer)
        if (event.type === 'result') {
          const text = extractTextFromResult(event)
          if (text) fullText = text
        }
      } catch { /* ignore */ }
    }

    activeStreams.delete(streamId)

    if (code === 0 || fullText) {
      win.webContents.send('claude:streamEnd', { streamId, text: fullText })
    } else {
      win.webContents.send('claude:streamError', { streamId, error: `CLI exited with code ${code}` })
    }
  })

  child.on('error', (err) => {
    activeStreams.delete(streamId)
    win.webContents.send('claude:streamError', { streamId, error: err.message })
  })
}

function extractTextFromContent(content: any[]): string {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('')
}

function extractTextFromResult(event: any): string {
  if (event.result) return typeof event.result === 'string' ? event.result : ''
  if (event.content) return extractTextFromContent(event.content)
  if (event.message?.content) return extractTextFromContent(event.message.content)
  return ''
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
