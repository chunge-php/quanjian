# 安全策略

## 支持的版本

| 版本  | 支持 |
| ----- | ---- |
| 0.1.x | 是   |
| < 0.1 | 否   |

## 报告漏洞

**请不要通过公开 Issue 报告安全问题。**

- 发送邮件至 **drq.chunge.php@qq.com**，标题以 `[quanjian security]` 开头；
- 或使用 GitHub 的 [私密漏洞报告](https://github.com/chunge-php/quanjian/security/advisories/new)。

请包含：受影响版本、复现步骤、影响评估。我们会在 **3 个工作日内**确认收到，**14 天内**给出修复计划或说明；修复发布后在 CHANGELOG 中致谢（如你愿意）。

## 本项目特别关注的风险

- **AK 泄露**：服务端 AK 只应存在于 Node 进程环境变量；若发现任何代码路径把 `BAIDU_SERVER_AK` 写入前端产物、SSE 事件、日志或错误响应，属高危。浏览器端 AK 泄露不属漏洞（设计上公开），但请确认 Referer 白名单指引清晰。
- **SSRF / 参数注入**：`/api/analyze` 接收用户输入的地址与坐标，所有参数经 zod 校验后才拼接百度请求。
- **缓存投毒**：磁盘缓存键由请求参数哈希得到，若发现可构造碰撞或路径穿越，请报告。
- **依赖漏洞**：Dependabot 每周检查；`pnpm audit` 高危项在下一个补丁版本修复。

## 使用者自查

- `.env*` 永远不要提交；仓库 `.gitignore` 已覆盖，但 fork 后请再次确认。
- 生产环境将 `ALLOW_SAMPLE_FALLBACK` 设为 `false`，避免样例数据被误当真实结果。
- 反向代理层对 `/api/analyze` 做基础限速（例如每 IP 每分钟 10 次），防止他人消耗你的百度配额。
