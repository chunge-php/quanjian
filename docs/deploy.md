# 部署 / 更新（Linux 服务器）

## 打包（本机）

```
./pack.sh 1.0.2        # Linux/Mac
pack 1.0.2             # Windows（pack.cmd）
# 不带版本号 = package.json 补丁号 +1，构建成功后写回
```

产出 `dist/quanjian-1.0.2.zip` 和 `dist/install.sh`（脚本在 zip 旁边，不在包里）。zip 里是一个 `quanjian-1.0.2/` 目录：Next standalone（`server.js`、`.next/`、精简 `node_modules/`）、`public/`、`data/samples/`（内置样例）、`.env.example`、`VERSION`，以及 pm2 备用的 `ecosystem.config.cjs` / `start.sh`。**浏览器端 AK 在打包时已内联进前端**（读本机 `.env.local` 的 `NEXT_PUBLIC_BAIDU_BROWSER_AK`），服务端 AK 不进包，装的时候在服务器上填。服务器不用 pnpm、不用构建。

## 服务器要求

- Linux + systemd（Ubuntu / CentOS / 宝塔都行）；没有 systemd 的容器/精简系统加 `--pm2`
- Node ≥ 18（宝塔：软件商店 → Node.js 版本管理器）、unzip、nginx（反代用，宝塔自带）
- 一个百度地图开放平台的**服务端 AK**（Web 服务 API），没有也能装，只能看内置样例

## 第一次安装

```
# 把 quanjian-1.0.2.zip 和 install.sh 传到服务器同一目录（宝塔：直接传到站点目录，例 /www/wwwroot/qj.example.com/）
cd /www/wwwroot/qj.example.com && bash install.sh
```

会问服务端 AK、域名（都可空）。**装在脚本所在目录**（`--dir=` 可改），非 root 自动 sudo。做的事：探测 Node/端口/systemd → 解压到 `releases/1.0.2/` → 从包内 `.env.example` 生成 `shared/.env`（写入 AK、`PORT=3010`、`HOSTNAME=127.0.0.1`）→ 写 `quanjian.service` → 切 `current` 软链并重启 → `curl /api/health` → 写宝塔 nginx 反向代理 → 成功删 zip。

| 服务     | 端口 | 内容                                                                                                           |
| -------- | ---- | -------------------------------------------------------------------------------------------------------------- |
| quanjian | 3010 | `node server.js`（systemd 单元 `quanjian.service`，`WorkingDirectory=current`，`EnvironmentFile=shared/.env`） |

## 参数

都可省略，全新安装时缺什么问什么：

| 参数                               | 作用                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `bash install.sh [包.zip]`         | 不指定包=同目录里版本号最大的 `quanjian-*.zip`；没装过=全新安装，装过=更新                                                      |
| `--dir=目录`                       | 安装目录，默认=脚本所在目录                                                                                                     |
| `--server-ak=xxx`                  | 百度服务端 AK，免交互（只在全新安装生成 `.env` 时用）                                                                           |
| `--domain=域名`                    | 写宝塔站点 `/www/server/panel/vhost/nginx/<域名>.conf` 的反向代理块（先备份）；站点配置不存在就生成完整示例 `nginx.<域名>.conf` |
| `--port=3010`                      | 服务端口；被别的进程占着会自动顺延到下一个空闲端口并记住                                                                        |
| `--pm2`                            | 用 pm2 托管（没有 systemd 的机器）；选过一次记在 `install.conf`，下次沿用；`--systemd` 切回                                     |
| `--check`                          | 只探测（Node ≥18、unzip、端口占用、systemd/pm2 可用、磁盘、内存），不安装                                                       |
| `--status`                         | 当前版本、服务状态、`/api/health` 返回（含 `hasServerAk`）、nginx 配置是否还在                                                  |
| `--stop` / `--start` / `--restart` | 停 / 起 / 重启                                                                                                                  |
| `--rollback`                       | 切回上一版 `releases/` 并重启（`.env`、缓存在 `shared/` 不动）                                                                  |
| `--nginx`                          | 只重新写 nginx 反向代理（换域名 / 申请证书后用）                                                                                |
| `--keep-zip`                       | 成功后保留 zip（默认成功即删，失败保留以便重试）                                                                                |
| `--uninstall`                      | 停服务、删 systemd 单元 / pm2 进程、删安装目录；先把 `shared/.env` 备到 `/root/quanjian-backup-日期.tar.gz`                     |

## 目录

```
<安装目录，如 /www/wwwroot/qj.example.com>/
  current -> releases/1.0.2/
  releases/1.0.2/            # server.js .next/ public/ data/samples/ node_modules/ …
    .env -> ../../shared/.env
    data/cache -> ../../shared/data/cache
  shared/.env                # 服务端 AK、PORT、HOSTNAME（跨版本保留，chmod 600）
  shared/data/cache/         # 磁盘缓存（静态图、POI 检索结果），可随时清空
  install.conf previous      # 端口/域名/托管方式；上一版版本号
  nginx.<域名>.conf          # 只在宝塔没建站点时生成的完整示例
```

只留最近 3 个版本。

## 更新

```
# 新 zip（和 install.sh，若脚本有更新）传到同目录，再跑一遍
bash install.sh
```

检测到 `shared/.env` 存在就走更新：解压成新版本目录 → 挂 `.env` 和缓存 → 切 `current` → 重启 → 健康检查 → 重写 nginx 块。安装成功后 zip 自动删除。

```
bash install.sh --rollback   # 回退上一版
bash install.sh --status     # 看状态
journalctl -u quanjian -n 100 --no-pager    # 看日志（pm2：pm2 logs quanjian --lines 100）
```

## 改配置

改 `shared/.env` 后 `bash install.sh --restart`。

- `BAIDU_SERVER_AK`：服务端 AK；`/api/health` 里 `hasServerAk:false` 就是还没填对
- `ALLOW_SAMPLE_FALLBACK=true`：无 AK / API 异常时回退内置样例
- `BAIDU_MAX_CONCURRENCY` / `BAIDU_QPS`：批量算路并发与 QPS（个人开发者默认足够）
- `PORT` / `HOSTNAME`：改端口也可以 `bash install.sh --port=3011`（会同步 .env 和 nginx）

## nginx 自动配置（宝塔）

宝塔先「网站 → 添加站点 <域名>」（纯静态，根目录随便），然后 `bash install.sh --domain=<域名>`（或安装时回答域名）。脚本在站点配置的 `server{}` 末尾插入一段 `# quanjian-proxy-start … # quanjian-proxy-end`（先备份成 `.bak-时间`，`nginx -t` 不过自动还原）：

```
location ^~ / {
    proxy_pass http://127.0.0.1:3010;
    proxy_http_version 1.1;          # SSE 三行：少一行街道体检的实时进度就卡住
    proxy_buffering off;
    proxy_read_timeout 600s;
    proxy_set_header Host $host;  … X-Real-IP / X-Forwarded-For / X-Forwarded-Proto
    proxy_cache off;
}
location ^~ /shared/ … /releases/ … /current/ { return 404; }   # 程序装在站点目录里，.env 绝不能被当静态文件放出去
```

`^~` 压过宝塔自带的 `.js/.css/.png` 静态缓存规则和 PHP 规则，不用手删。证书：宝塔里给站点一键申请 SSL、开强制 HTTPS，不用再跑脚本（证书行脚本不碰）。重跑 `--nginx` 会整段替换标记之间的内容。非宝塔环境：脚本生成 `nginx.<域名>.conf` 完整示例，放到 `/etc/nginx/conf.d/` 后 `nginx -s reload`。

## 百度控制台

- **浏览器端 AK**（JSAPI GL）：Referer 白名单加 `<域名>/*`（多个子域 `*.主域名/*`）；这个 AK 是打包时内联进前端的，换 AK 要改本机 `.env.local` 重新 pack
- **服务端 AK**（Web 服务 API）：IP 白名单加服务器公网 IP（或 `0.0.0.0/0`）；改 `shared/.env` 后 `--restart`，`/api/health` 看 `hasServerAk:true`

## 没有 systemd 的机器

`bash install.sh --pm2`：自动 `npm i -g pm2`，用包里的 `ecosystem.config.cjs`（自己解析同目录 `.env`）启动，`pm2 save`；开机自启按 `pm2 startup` 的提示执行一次。所有参数（`--status/--restart/--rollback/--uninstall`）同样可用。手动前台跑：`cd <安装目录>/current && bash start.sh`。

## 卸载

```
bash install.sh --uninstall     # 输入 yes 确认；备份 shared/.env 到 /root/quanjian-backup-日期.tar.gz
```

nginx 里 `quanjian-proxy-start/end` 之间那段要自己删。

## 常见问题

- **`/api/health` 无响应**：`journalctl -u quanjian -n 100`。多半是 Node <18（`node -v`）、端口被占（`bash install.sh --check` 会自动换端口）、Windows 打的包缺文件（看 `current/node_modules/next` 在不在；不在脚本会尝试 `npm i` 补装，需要服务器能上 npm 源）
- **街道体检进度卡住 / 只出最后结果**：反代没加 SSE 三行（`proxy_buffering off; proxy_read_timeout 600s; proxy_http_version 1.1;`），`bash install.sh --nginx` 重写；或者中间还有 CDN 把响应缓冲了
- **地图不显示 / 浏览器控制台 AK 报错**：浏览器端 AK 的 Referer 白名单没加域名，或打包机 `.env.local` 里是错的 AK
- **hasServerAk:false**：`shared/.env` 的 `BAIDU_SERVER_AK` 还是 `your_server_ak_here`，填好后 `--restart`
- **宝塔重新生成了站点配置**：`bash install.sh --status` 会报「没有本脚本写的反向代理」，`--nginx` 再写一次
- **sudo 后找不到 node**：脚本会自动找宝塔 `/www/server/nodejs/v*/bin` 和 nvm 目录；还找不到就 `ln -s <node 路径> /usr/local/bin/node`
- **磁盘缓存太大**：`rm -rf shared/data/cache/*`，不用重启
