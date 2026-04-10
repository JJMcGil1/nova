const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const releaseDir = path.join(__dirname, '..', 'release')
const pkg = require(path.join(__dirname, '..', 'package.json'))
const version = pkg.version

function sha256(filePath) {
  const data = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(data).digest('hex')
}

function fileSize(filePath) {
  return fs.statSync(filePath).size
}

function findAsset(pattern) {
  const files = fs.readdirSync(releaseDir)
  return files.find(f => pattern.test(f))
}

// Find release artifacts
const arm64Dmg = findAsset(new RegExp(`Nova-${version.replace(/\./g, '\\.')}-arm64\\.dmg$`))
const x64Dmg = findAsset(new RegExp(`Nova-${version.replace(/\./g, '\\.')}(?!.*arm64)\\.dmg$`))
const arm64Zip = findAsset(new RegExp(`Nova-${version.replace(/\./g, '\\.')}-arm64-mac\\.zip$`))
const x64Zip = findAsset(new RegExp(`Nova-${version.replace(/\./g, '\\.')}-mac\\.zip$`))

const latestJson = {
  version,
  releaseDate: new Date().toISOString(),
  releaseNotes: 'Bug fixes and improvements.',
  platforms: {},
}

const hashLines = []

function addPlatform(key, fileName) {
  if (!fileName) return
  const filePath = path.join(releaseDir, fileName)
  if (!fs.existsSync(filePath)) return
  const hash = sha256(filePath)
  const size = fileSize(filePath)
  latestJson.platforms[key] = { sha256: hash, size }
  hashLines.push(`${hash}  ${fileName}`)
  console.log(`  ${key}: ${fileName} (${(size / 1024 / 1024).toFixed(1)} MB)`)
}

console.log(`\nGenerating release hashes for Nova v${version}\n`)

addPlatform('mac-arm64', arm64Dmg)
addPlatform('mac', x64Dmg)
addPlatform('mac-arm64-zip', arm64Zip)
addPlatform('mac-zip', x64Zip)

// Write latest.json
const latestPath = path.join(releaseDir, 'latest.json')
fs.writeFileSync(latestPath, JSON.stringify(latestJson, null, 2))
console.log(`\nWrote ${latestPath}`)

// Write hashes.txt
const hashesPath = path.join(releaseDir, 'hashes.txt')
fs.writeFileSync(hashesPath, hashLines.join('\n') + '\n')
console.log(`Wrote ${hashesPath}\n`)
