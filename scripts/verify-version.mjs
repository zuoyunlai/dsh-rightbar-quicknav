/**
 * 发版前置校验：tag 必须等于 v{package.json version}，且与 client.js 里的 VERSION 常量一致。
 * 用于 `.github/workflows/publish.yml`，避免「tag 与包版本不一致」造成 npm 侧版本错位。
 */
import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const tag = process.env.GITHUB_REF_NAME || process.argv[2] || ''
const expected = 'v' + pkg.version

if (tag !== expected) {
  console.error(`✗ tag ${tag || '(空)'} ≠ ${expected}`)
  process.exit(1)
}

const src = fs.readFileSync('client.js', 'utf8')
const m = src.match(/const VERSION = '([^']+)'/)
if (!m) {
  console.error('✗ client.js 里找不到 VERSION 常量')
  process.exit(1)
}
if (m[1] !== pkg.version) {
  console.error(`✗ client.js VERSION=${m[1]} ≠ package.json ${pkg.version}`)
  process.exit(1)
}

console.log(`✓ 版本一致：${pkg.name}@${pkg.version}`)
