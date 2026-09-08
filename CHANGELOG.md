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

### Added

- 两地对比：A / B 双槽位串行分析，地图双圈同屏 + 聚焦切换，抽屉内对比视图（分数 / 雷达叠加 / 十类对照 / 硬指标 / 盲区 / 自动结论）与 A、B 完整报告 tab
- 模拟新建：「假如在这里新建一处菜市场 / 药店 / 小学」，地图放置拟建设施（朱砂虚线标记 + 1 km 判定圈），本地纯函数即时重算分数 / 盲区 / 建议，前后对比面板，规划建议旁「去模拟」直达，可导出模拟结果 PDF
- 天气：报告首屏「今日天气」一行（温度 / 体感 / 风 / 湿度）与步行舒适度提示，图签同步印出
- 图例筛选：图例兼图层开关，按类别单选 / 多选、只看硬指标、只看圈内设施，等时圈 / 盲区 / 采样点可整体开关
- PDF 详版：打印专用「怎么看」说明、十类明细表、设施清单、方法说明与图签；对比模式三段分页（对比视图 → A → B）
- 地址联想：搜索框输入即联想（同城候选优先），↑↓ 选择、回车定位并体检；内置样例下拉

[Unreleased]: https://github.com/chunge-php/quanjian/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/chunge-php/quanjian/releases/tag/v0.1.0
