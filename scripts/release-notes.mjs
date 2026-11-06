/**
 * 从 CHANGELOG.md 里抽出当前版本那一节，写成 release-notes.md，供 `gh release create --notes-file` 使用。
 * 找不到该版本时退回一行标题，不让发版卡住。
 */
import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const md = fs.readFileSync('CHANGELOG.md', 'utf8')
const marker = '## [' + pkg.version + ']'
const i = md.indexOf(marker)

let notes
if (i < 0) {
  notes = 'v' + pkg.version + '\n'
  console.log('（CHANGELOG 里没有 ' + pkg.version + ' 一节，使用占位说明）')
} else {
  const rest = md.slice(i + marker.length)
  const next = rest.indexOf('\n## [')
  notes = (marker + rest.slice(0, next < 0 ? undefined : next)).trim() + '\n'
}

fs.writeFileSync('release-notes.md', notes, 'utf8')
console.log('✓ release-notes.md 已生成，' + notes.split('\n').length + ' 行')
