# 贡献指南

感谢你关注圈见。本项目欢迎 Issue、PR、文档修订与真实社区的对比测试数据。

## 开始之前

- 阅读 [README.md](README.md) 跑通本地开发（`bash scripts/setup.sh` → `pnpm dev`）。
- 阅读 [docs/技术设计文档.md](docs/技术设计文档.md) 了解流水线与各模块边界。
- 查看 [ROADMAP.md](ROADMAP.md) 与已有 Issue，避免重复工作；较大改动请先开 Issue 讨论。
- 遵守 [行为准则](CODE_OF_CONDUCT.md)。

## 分支模型

- `main`：始终可构建、可部署；受 CI 保护，仅通过 PR 合入。
- 功能分支从 `main` 切出，命名：`feat/<简短描述>`、`fix/<简短描述>`、`docs/<简短描述>`、`ci/<简短描述>`。
- 发布用 `v<major>.<minor>.<patch>` 标签，推送标签自动构建镜像。

## 提交信息（Conventional Commits）

```
<type>(<scope>): <subject>

<body：为什么这样改，而不是改了什么>
```

- `type`：`feat` `fix` `perf` `refactor` `docs` `test` `ci` `chore` `build`
- `scope`：`baidu` `isochrone` `report` `pipeline` `api` `ui` `docs` `docker` 等目录名
- `subject`：中文或英文均可，不超过 72 字符，不以句号结尾

示例：`fix(baidu): 批量算路分批时保留 origin 顺序，修复方向错位`

## PR 流程

1. Fork 并创建功能分支。
2. 本地依次通过：`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`。
3. 填写 PR 模板中的自检清单；涉及 UI 附截图，涉及 API 调用策略说明调用次数变化。
4. 至少一位维护者 Review 通过且 CI 绿色后，由维护者 **Squash merge**。
5. 用户可见变更请在 `CHANGELOG.md` 的 `[Unreleased]` 下追加一行。

## 代码风格

- TypeScript `strict`；不使用 `any`，确需时写 `unknown` 并收窄。
- Prettier 已配置（无分号、单引号、宽度 100），提交前 `pnpm format`。
- 类型契约统一放 `lib/types.ts`；改动它必须同步全部调用方，并在 PR 中标注 `BREAKING`。
- 单文件不超过 500 行，超出时拆分模块。
- 纯函数优先：`lib/isochrone`、`lib/report` 不得直接发网络请求，网络只经 `lib/baidu`。
- 所有对外网络调用必须经过限流器与缓存层；新增接口在 `docs/技术设计文档.md` 的错误处理矩阵补一行。
- 坐标一律 BD-09，字段名固定 `lng` / `lat`；拼接百度请求参数时注意 `lat,lng` 顺序。
- 日志与错误信息中禁止出现 AK。

## 测试

- 单元测试放 `tests/`，文件名 `<模块>.test.ts`，使用 Vitest。
- 几何 / 插值 / 评分等纯函数须有测试；涉及百度 API 的逻辑用录制的响应夹具（`tests/fixtures/`）测试，不在 CI 中真实调用。
- 提交真实社区对比数据请按 [docs/测试报告-模板.md](docs/测试报告-模板.md) 填写并放入 `docs/reports/`。

## 报告问题

- Bug / 功能建议：使用 Issue 模板。
- 安全问题：见 [SECURITY.md](SECURITY.md)，不要公开提交。
