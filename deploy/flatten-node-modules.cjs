// 把 Next standalone 里 pnpm 的符号链接布局（node_modules/.pnpm/… + 软链）压平成普通平铺布局
// 原因：zip / xcopy / 7z 复制时会把软链当成目录展开，next 找不到旁边的 styled-jsx（Cannot find module 'styled-jsx/package.json'），服务器起不来
// 用法：node deploy/flatten-node-modules.cjs <包目录>   （pack.sh / pack.cmd 组装时自动调用）
const fs = require('fs')
const path = require('path')

const root = process.argv[2]
if (!root) {
  console.error('用法: node flatten-node-modules.cjs <包目录>')
  process.exit(1)
}
const nm = path.join(root, 'node_modules')
const store = path.join(nm, '.pnpm')
if (!fs.existsSync(store)) {
  console.log('   node_modules 已是平铺布局，不用处理')
  process.exit(0)
}

const isLink = (p) => {
  try {
    return fs.lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}
const isDir = (p) => {
  try {
    return fs.lstatSync(p).isDirectory()
  } catch {
    return false
  }
}
const version = (p) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8')).version
  } catch {
    return '?'
  }
}
const pkgs = new Map() // name -> 真实目录（.pnpm/<id>/node_modules/<name>，lstat 是目录不是软链）
for (const id of fs.readdirSync(store)) {
  const base = path.join(store, id, 'node_modules')
  if (!isDir(base)) continue
  const names = []
  for (const n of fs.readdirSync(base)) {
    if (n.startsWith('@')) {
      for (const s of fs.readdirSync(path.join(base, n))) names.push(`${n}/${s}`)
    } else names.push(n)
  }
  for (const name of names) {
    const src = path.join(base, name)
    if (isLink(src) || !isDir(src)) continue
    const prev = pkgs.get(name)
    if (prev && version(prev) !== version(src))
      console.log(`   [注意] ${name} 有两个版本 ${version(prev)} / ${version(src)}，平铺只留前者`)
    if (!prev) pkgs.set(name, src)
  }
}
// 先把顶层软链拆掉，再把真实目录拷到顶层；全部拷完再删 .pnpm（拷贝时 dereference，包内若还有软链一并展开）
for (const name of pkgs.keys()) {
  const dest = path.join(nm, name)
  if (isLink(dest)) fs.rmSync(dest, { force: true })
}
let n = 0
for (const [name, src] of pkgs) {
  const dest = path.join(nm, name)
  if (fs.existsSync(dest)) continue
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.cpSync(src, dest, { recursive: true, dereference: true })
  n++
}
fs.rmSync(store, { recursive: true, force: true })
for (const f of ['.modules.yaml', '.pnpm-workspace-state.json'])
  fs.rmSync(path.join(nm, f), { force: true })
// 自检：next 能找到，且 next 能找到旁边的 styled-jsx
try {
  const nextDir = path.dirname(require.resolve('next/package.json', { paths: [root] }))
  require.resolve('styled-jsx/package.json', { paths: [nextDir] })
} catch (e) {
  console.error(`   [失败] 平铺后 next / styled-jsx 仍解析不到：${e.message}`)
  process.exit(1)
}
console.log(`   node_modules 已从 pnpm 布局压平：${n} 个包搬到顶层，.pnpm 已删`)
