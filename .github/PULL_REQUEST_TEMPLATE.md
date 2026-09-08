## 变更说明

<!-- 做了什么、为什么。关联 Issue 写 Closes #123 -->

## 变更类型

- [ ] fix：修复
- [ ] feat：新功能
- [ ] refactor / perf：重构或性能
- [ ] docs / ci / chore：文档、CI、杂项

## 自检清单

- [ ] `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` 本地通过
- [ ] 未提交任何 AK / `.env.local`
- [ ] 若改动了 `lib/types.ts`，已同步所有调用方
- [ ] 若改动了 API 调用策略，已在 PR 中说明对调用次数 / QPS 的影响
- [ ] 若为用户可见变更，已更新 `CHANGELOG.md` 的 `[Unreleased]`

## 截图 / 录屏（UI 变更时）
