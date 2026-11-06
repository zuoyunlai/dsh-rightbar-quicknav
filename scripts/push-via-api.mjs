/**
 * 走 GitHub Git Data API 推送当前本地提交（api.github.com），
 * 用于本机 github.com:443 连不上（常见约 21s 超时）时。
 *
 * 用法：node scripts/push-via-api.mjs [--dry]
 *
 * 行为：以远端当前 main 的 tree 为基底，把本地工作树里被 git 跟踪的文件全部上传，
 * 建一个「父提交 = 远端 main」的新提交，再把 refs/heads/main 指过去。
 * 结果：远端 main 的内容与本地一致（提交 SHA 会与本地不同，tree 相同）。
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const dry = process.argv.includes('--dry')
const REPO = process.env.GH_REPO || 'zuoyunlai/dsh-rightbar-quicknav'
const BRANCH = process.env.GH_BRANCH || 'main'
const token = execSync('gh auth token', { encoding: 'utf8' }).trim()

const api = async (method, url, body) => {
  const res = await fetch('https://api.github.com' + url, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dsh-rightbar-quicknav-push',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(method + ' ' + url + ' → ' + res.status + ' ' + text.slice(0, 300))
  return text ? JSON.parse(text) : null
}

const git = (args) => execSync('git ' + args, { encoding: 'utf8' }).trim()

const message = git('log -1 --pretty=%s')
const files = git('-c core.quotepath=false ls-files').split('\n').filter(Boolean)
console.log('提交信息:', message)
console.log('文件数:', files.length)

const remoteRef = await api('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`)
const remoteSha = remoteRef.object.sha
const remoteCommit = await api('GET', `/repos/${REPO}/git/commits/${remoteSha}`)
console.log('远端 ' + BRANCH + ':', remoteSha.slice(0, 7), 'tree:', remoteCommit.tree.sha.slice(0, 7))

if (dry) {
  console.log('(dry-run，不写入)')
  process.exit(0)
}

const entries = []
let i = 0
const worker = async () => {
  while (i < files.length) {
    const rel = files[i++]
    const b64 = fs.readFileSync(path.resolve(rel)).toString('base64')
    const blob = await api('POST', `/repos/${REPO}/git/blobs`, { content: b64, encoding: 'base64' })
    entries.push({ path: rel.replace(/\\/g, '/'), mode: '100644', type: 'blob', sha: blob.sha })
    process.stdout.write('.')
  }
}
await Promise.all([worker(), worker(), worker(), worker()])
console.log('\nblob 上传完成:', entries.length)

const tree = await api('POST', `/repos/${REPO}/git/trees`, { base_tree: remoteCommit.tree.sha, tree: entries })
const commit = await api('POST', `/repos/${REPO}/git/commits`, {
  message,
  tree: tree.sha,
  parents: [remoteSha],
})
await api('PATCH', `/repos/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: true })

console.log('新提交:', commit.sha)
console.log('已更新 ' + BRANCH + ' →', commit.sha.slice(0, 7))
console.log('提示：本地 origin/' + BRANCH + ' 已过期，可 git fetch 或 git update-ref 同步。')
