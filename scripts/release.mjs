import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, createWriteStream } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const archiver = require('archiver')

const dir = 'server/bundles'
const versionFile = `${dir}/latest.json`
mkdirSync(dir, { recursive: true })

let version = '1.0.1'
if (existsSync(versionFile)) {
  const prev = JSON.parse(readFileSync(versionFile, 'utf8')).version
  const parts = prev.split('.').map(Number)
  parts[2] = (parts[2] || 0) + 1
  version = parts.join('.')
}

rmSync(`${dir}/dist.zip`, { force: true })

const output = createWriteStream(`${dir}/dist.zip`)
const archive = new archiver.ZipArchive({ zlib: { level: 9 } })

output.on('close', () => {
  writeFileSync(versionFile, JSON.stringify({ version, file: '/update/dist.zip' }, null, 2))
  console.log(`OTA bundle ready: version ${version} -> ${dir}/dist.zip (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`)
  console.log(`Push to GitHub and Render will serve it at /update/latest.json`)
})

output.on('error', (err) => {
  console.error(err)
  process.exit(1)
})

archive.on('error', (err) => {
  console.error(err)
  process.exit(1)
})

archive.pipe(output)
archive.directory('dist', false)
void archive.finalize()
