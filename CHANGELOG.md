# 变更日志

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- 项目骨架：Next.js 14 App Router + TypeScript + Tailwind + Vitest，端口 3010，standalone 输出
- 全局类型契约 `lib/types.ts` 与设施类别定义 `lib/categories.ts`（10 类，3 类硬指标）
- 等时圈扇形采样 `lib/isochrone/sampling.ts` 与几何工具 `lib/isochrone/geo.ts`
- 多阶段 Dockerfile（node:20-alpine，非 root，HEALTHCHECK）、docker-compose、一键脚本 `scripts/setup.*` `scripts/demo.*`
- GitHub Actions：CI（format / lint / typecheck / test / build）、tag 触发 GHCR 镜像发布；Issue / PR 模板；Dependabot
- 文档：README、技术设计文档、测试报告模板、演示视频脚本、开源治理、路线图、贡献指南、行为准则、安全策略

### Changed

### Fixed

### Security

## [0.1.0] - 未发布

大赛提交版本，范围见 [ROADMAP.md](ROADMAP.md) v0.1。

[Unreleased]: https://github.com/chunge-php/quanjian/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/chunge-php/quanjian/releases/tag/v0.1.0
