import { app, BrowserWindow, net } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { execSync } from 'node:child_process'

const GITHUB_OWNER = 'JJMcGil1'
const GITHUB_REPO = 'nova'
const POLL_INTERVAL = 5 * 60 * 1000    // 5 minutes
const STARTUP_DELAY = 5 * 1000          // 5 seconds
const DOWNLOAD_TIMEOUT = 5 * 60 * 1000  // 5 minutes
const API_TIMEOUT = 30 * 1000           // 30 seconds
const DOWNLOAD_DIR = '/tmp/nova-update/'

type UpdateCallback = (data?: any) => void

interface LatestRelease {
  version: string
  releaseDate: string
  releaseNotes: string
  platforms: {
    [key: string]: {
      sha256: string
      size: number
    }
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let latestRelease: LatestRelease | null = null
let downloadedAssetPath: string | null = null

const callbacks: {
  onUpdateAvailable: UpdateCallback[]
  onDownloadProgress: UpdateCallback[]
  onUpdateDownloaded: UpdateCallback[]
  onUpdateError: UpdateCallback[]
} = {
  onUpdateAvailable: [],
  onDownloadProgress: [],
  onUpdateDownloaded: [],
  onUpdateError: [],
}

function emit(event: keyof typeof callbacks, data?: any) {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send(`updater:${event}`, data)
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

function getArch(): string {
  return process.arch === 'arm64' ? 'arm64' : 'x64'
}

function getAssetName(version: string): string {
  const arch = getArch()
  if (arch === 'arm64') {
    return `Nova-${version}-arm64.dmg`
  }
  return `Nova-${version}.dmg`
}

function getPlatformKey(): string {
  const arch = getArch()
  return arch === 'arm64' ? 'mac-arm64' : 'mac'
}

async function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('API request timed out')), API_TIMEOUT)
    const request = net.request(url)
    let body = ''

    request.on('response', (response) => {
      response.on('data', (chunk) => { body += chunk.toString() })
      response.on('end', () => {
        clearTimeout(timeout)
        try {
          resolve(JSON.parse(body))
        } catch {
          reject(new Error('Failed to parse response'))
        }
      })
    })

    request.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    request.end()
  })
}

export async function checkForUpdates(): Promise<boolean> {
  try {
    const currentVersion = app.getVersion()
    const releaseUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
    const release = await fetchJSON(releaseUrl)

    const tagVersion = release.tag_name.replace(/^v/, '')
    if (compareVersions(tagVersion, currentVersion) <= 0) {
      return false
    }

    // Fetch latest.json from release assets
    const latestJsonAsset = release.assets?.find((a: any) => a.name === 'latest.json')
    if (latestJsonAsset) {
      latestRelease = await fetchJSON(latestJsonAsset.browser_download_url)
    } else {
      latestRelease = {
        version: tagVersion,
        releaseDate: release.published_at,
        releaseNotes: release.body || 'Bug fixes and improvements.',
        platforms: {},
      }
    }

    emit('onUpdateAvailable', {
      version: tagVersion,
      releaseNotes: latestRelease?.releaseNotes || '',
      releaseDate: latestRelease?.releaseDate || '',
    })

    return true
  } catch (err: any) {
    emit('onUpdateError', { message: `Update check failed: ${err.message}` })
    return false
  }
}

export async function downloadUpdate(): Promise<boolean> {
  try {
    if (!latestRelease) {
      emit('onUpdateError', { message: 'No update available to download' })
      return false
    }

    const version = latestRelease.version
    const assetName = getAssetName(version)
    const downloadUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${version}/${assetName}`

    // Ensure download directory
    if (!fs.existsSync(DOWNLOAD_DIR)) {
      fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })
    }

    const destPath = path.join(DOWNLOAD_DIR, assetName)

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Download timed out')), DOWNLOAD_TIMEOUT)
      const request = net.request(downloadUrl)

      request.on('response', (response) => {
        // Handle redirects (GitHub uses them for asset downloads)
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            clearTimeout(timeout)
            downloadFromUrl(typeof redirectUrl === 'string' ? redirectUrl : redirectUrl[0], destPath, timeout)
              .then(resolve)
              .catch(reject)
            return
          }
        }

        const totalSize = parseInt(response.headers['content-length'] as string, 10) || 0
        let transferred = 0
        const fileStream = fs.createWriteStream(destPath)

        response.on('data', (chunk) => {
          fileStream.write(chunk)
          transferred += chunk.length
          if (totalSize > 0) {
            emit('onDownloadProgress', {
              percent: Math.round((transferred / totalSize) * 100),
              transferred,
              total: totalSize,
            })
          }
        })

        response.on('end', () => {
          clearTimeout(timeout)
          fileStream.end()
          resolve()
        })
      })

      request.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })

      request.end()
    })

    // Verify SHA256 if available
    const platformKey = getPlatformKey()
    const expectedHash = latestRelease.platforms?.[platformKey]?.sha256
    if (expectedHash) {
      const fileBuffer = fs.readFileSync(destPath)
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex')
      if (hash !== expectedHash) {
        fs.unlinkSync(destPath)
        emit('onUpdateError', { message: 'SHA256 hash mismatch — download may be corrupted' })
        return false
      }
    }

    downloadedAssetPath = destPath
    emit('onUpdateDownloaded', { version })
    return true
  } catch (err: any) {
    emit('onUpdateError', { message: `Download failed: ${err.message}` })
    return false
  }
}

function downloadFromUrl(url: string, destPath: string, parentTimeout: ReturnType<typeof setTimeout>): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = net.request(url)

    request.on('response', (response) => {
      const totalSize = parseInt(response.headers['content-length'] as string, 10) || 0
      let transferred = 0
      const fileStream = fs.createWriteStream(destPath)

      response.on('data', (chunk) => {
        fileStream.write(chunk)
        transferred += chunk.length
        if (totalSize > 0) {
          emit('onDownloadProgress', {
            percent: Math.round((transferred / totalSize) * 100),
            transferred,
            total: totalSize,
          })
        }
      })

      response.on('end', () => {
        clearTimeout(parentTimeout)
        fileStream.end()
        resolve()
      })
    })

    request.on('error', (err) => {
      clearTimeout(parentTimeout)
      reject(err)
    })

    request.end()
  })
}

export async function installUpdate(): Promise<void> {
  try {
    if (!downloadedAssetPath || !fs.existsSync(downloadedAssetPath)) {
      emit('onUpdateError', { message: 'No downloaded update found' })
      return
    }

    const dmgPath = downloadedAssetPath
    const mountPoint = '/tmp/nova-update-mount'

    // Clean up any previous mount
    try {
      execSync(`hdiutil detach "${mountPoint}" -force 2>/dev/null || true`)
    } catch { /* ignore */ }

    // Mount the DMG
    execSync(`hdiutil attach "${dmgPath}" -mountpoint "${mountPoint}" -nobrowse -noautoopen`)

    // Find the .app in the mounted volume
    const items = fs.readdirSync(mountPoint)
    const appName = items.find(i => i.endsWith('.app'))
    if (!appName) {
      execSync(`hdiutil detach "${mountPoint}" -force`)
      emit('onUpdateError', { message: 'No .app found in DMG' })
      return
    }

    const sourcePath = path.join(mountPoint, appName)
    const destPath = path.dirname(app.getPath('exe')).replace(/\/Contents\/MacOS$/, '')

    // Copy the new app over the old one
    execSync(`rm -rf "${destPath}"`)
    execSync(`cp -R "${sourcePath}" "${destPath}"`)

    // Remove quarantine attribute
    execSync(`xattr -cr "${destPath}"`)

    // Unmount
    execSync(`hdiutil detach "${mountPoint}" -force`)

    // Clean up download
    try {
      fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true })
    } catch { /* ignore */ }

    // Relaunch
    app.relaunch()
    app.exit(0)
  } catch (err: any) {
    emit('onUpdateError', { message: `Install failed: ${err.message}` })
  }
}

export function dismissUpdate(): void {
  latestRelease = null
}

export function startAutoUpdatePolling(): void {
  setTimeout(async () => {
    await checkForUpdates()
    pollTimer = setInterval(() => checkForUpdates(), POLL_INTERVAL)
  }, STARTUP_DELAY)
}

export function stopAutoUpdatePolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
