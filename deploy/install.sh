#!/usr/bin/env bash
# 圈见 · 服务器安装 / 更新（同一个脚本，自动识别）
#   把 quanjian-<版本>.zip 和本脚本上传到服务器同一目录，然后：
#     bash install.sh                       # 自动找同目录里最新的 zip；没装过=全新安装（会问百度服务端 AK 和域名），装过=更新
#     bash install.sh quanjian-1.0.2.zip    # 指定包
#   可选参数（都可省略，全新安装时缺什么问什么）：
#     --dir=目录              安装目录，默认=本脚本所在目录（宝塔站点目录直接放 zip+脚本就装在站点里）
#     --server-ak=xxx         百度地图服务端 AK（只在全新安装生成 .env 时用，不给就交互问）   --port=3010  服务端口
#     --domain=qj.example.com 写宝塔站点的 nginx 反向代理（含 SSE 三行）；没有站点配置就生成示例 $DIR/nginx.<域名>.conf
#     --pm2                   没有 systemd 的机器用 pm2 托管（默认 systemd；选过一次记在 install.conf 里下次沿用）
#     --rollback              回退到上一个版本   --status  看服务状态 + /api/health   --check  只探测环境/端口不安装
#     --stop / --start / --restart   停 / 起 / 重启 服务
#     --nginx                 只重新写 nginx 反向代理（换域名/申请证书后用）
#     --keep-zip              安装成功后保留 zip（默认成功即删，失败保留以便重试）
#     --uninstall             卸载：停服务、删 systemd 单元 / pm2 进程、删安装目录（先备份 .env 到 /root）
#   目录结构：$DIR/releases/<版本>/  $DIR/current -> 当前版本  $DIR/shared/{.env,data/cache}（.env、磁盘缓存跨版本保留）
set -euo pipefail
[[ $EUID -eq 0 ]] || exec sudo -E bash "$0" "$@"
HERE="$(cd "$(dirname "$0")" && pwd)"
ZIP=""; KEEP_ZIP=0; DIR=""; SERVER_AK=""; DOMAIN=""; PORT=""; RUNNER=""; ACTION="install"
for a in "$@"; do case "$a" in
  --dir=*) DIR="${a#*=}";; --server-ak=*) SERVER_AK="${a#*=}";; --domain=*) DOMAIN="${a#*=}";; --port=*) PORT="${a#*=}";;
  --pm2) RUNNER="pm2";; --systemd) RUNNER="systemd";;
  --rollback) ACTION="rollback";; --status) ACTION="status";; --check) ACTION="check";; --uninstall) ACTION="uninstall";; --nginx) ACTION="nginx";; --keep-zip) KEEP_ZIP=1;; --stop) ACTION="stop";; --start) ACTION="start";; --restart) ACTION="restart";; --help|-h) sed -n 2,16p "$0"; exit 0;;
  *.zip) ZIP="$a";; *) echo "不认识的参数 $a"; exit 1;;
esac; done
# 安装目录：--dir 指定 > 本脚本所在目录（宝塔：站点目录里放 zip 和脚本，就装在站点目录）
[[ -z "$DIR" ]] && DIR="$HERE"
DIR="${DIR%/}"; SHARED="$DIR/shared"; CONF="$DIR/install.conf"; APP=quanjian; UNIT="/etc/systemd/system/$APP.service"
ok()   { echo "  [OK]   $*"; }
fail() { echo "  [失败] $*"; exit 1; }
step() { echo; echo "== $*"; }
# sudo 会重置 PATH，nvm / 宝塔装的 node 找不到：补上常见位置
if ! command -v node >/dev/null 2>&1; then
  for b in $(ls -d /www/server/nodejs/v*/bin 2>/dev/null | sort -V | tail -1) $(ls -d /root/.nvm/versions/node/v*/bin "${SUDO_USER:+/home/$SUDO_USER/.nvm/versions/node/v*/bin}" 2>/dev/null | sort -V | tail -1) /usr/local/bin; do [[ -x "$b/node" ]] && { export PATH="$b:$PATH"; break; }; done
fi
# 上次安装记下的端口 / 域名 / 托管方式
[[ -f "$CONF" ]] && . "$CONF"
PORT="${PORT:-${CONF_PORT:-3010}}"; DOMAIN="${DOMAIN:-${CONF_DOMAIN:-}}"; RUNNER="${RUNNER:-${CONF_RUNNER:-}}"
[[ -z "$RUNNER" ]] && { command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]] && RUNNER=systemd || RUNNER=pm2; }
[[ "$PORT" =~ ^[0-9]+$ ]] || fail "--port 要是数字：$PORT"
save_conf() { printf 'CONF_PORT=%s\nCONF_DOMAIN=%s\nCONF_RUNNER=%s\n' "$PORT" "$DOMAIN" "$RUNNER" > "${1:-$CONF}"; }

# ---------- 服务托管（systemd 为主，pm2 备用），下面所有动作都走这几个函数 ----------
svc_active() { if [[ $RUNNER == systemd ]]; then systemctl is-active "$APP" 2>/dev/null || echo 未安装; else pm2 describe "$APP" >/dev/null 2>&1 && { pm2 jlist 2>/dev/null | grep -o "\"name\":\"$APP\"[^}]*\"status\":\"[a-z]*\"" | grep -o '"status":"[a-z]*"' | head -1 | cut -d'"' -f4 || echo unknown; } || echo 未安装; fi; }
svc_stop()   { if [[ $RUNNER == systemd ]]; then systemctl stop "$APP" 2>/dev/null || true; else pm2 stop "$APP" >/dev/null 2>&1 || true; fi; }
svc_start()  { if [[ $RUNNER == systemd ]]; then systemctl start "$APP"; else pm2 start "$APP" >/dev/null 2>&1 || pm2 start "$DIR/current/ecosystem.config.cjs" >/dev/null; pm2 save >/dev/null 2>&1 || true; fi; }
svc_restart() {   # pm2 的 cwd 记的是解压出来的真实目录，切了版本必须 delete 再 start 才会进新目录
  if [[ $RUNNER == systemd ]]; then systemctl restart "$APP"; else pm2 delete "$APP" >/dev/null 2>&1 || true; pm2 start "$DIR/current/ecosystem.config.cjs" >/dev/null; pm2 save >/dev/null 2>&1 || true; fi
}
svc_logs()   { if [[ $RUNNER == systemd ]]; then journalctl -u "$APP" -n "${1:-25}" --no-pager -o cat 2>/dev/null; else pm2 logs "$APP" --lines "${1:-25}" --nostream 2>/dev/null; fi; }
svc_status() { printf '  %-13s %s（%s 托管，端口 %s）\n' "$APP" "$(svc_active)" "$RUNNER" "$PORT"; }
svc_remove() { if [[ $RUNNER == systemd ]]; then systemctl disable --now "$APP" 2>/dev/null || true; rm -f "$UNIT"; systemctl daemon-reload; else pm2 delete "$APP" >/dev/null 2>&1 || true; pm2 save >/dev/null 2>&1 || true; fi; }
health() { curl -s --max-time "${2:-8}" "http://127.0.0.1:${1:-$PORT}/api/health" 2>/dev/null || true; }

# ---------- 服务状态 / 起停 / 回退 ----------
if [[ $ACTION == status ]]; then
  echo "当前版本：$(cat "$DIR/current/VERSION" 2>/dev/null || echo 未安装)   目录：$DIR"; svc_status
  H="$(health)"; if [[ -n "$H" ]]; then echo "  /api/health   $H"; echo "$H" | grep -q '"hasServerAk":true' || echo "  [注意] hasServerAk 不是 true：$SHARED/.env 里 BAIDU_SERVER_AK 还是占位符，实时分析不可用（样例仍可看）"; else echo "  /api/health   [问题] http://127.0.0.1:$PORT/api/health 无响应 → 看日志：$([[ $RUNNER == systemd ]] && echo "journalctl -u $APP -n 100 --no-pager" || echo "pm2 logs $APP --lines 100")"; fi
  if [[ -n "$DOMAIN" ]]; then
    CF="/www/server/panel/vhost/nginx/$DOMAIN.conf"
    if [[ -f "$CF" ]] && grep -q 'quanjian-proxy-start' "$CF" && grep -q "proxy_pass http://127.0.0.1:$PORT;" "$CF"; then echo "  nginx        $CF 有本脚本写的反向代理（端口 $PORT）"
    elif [[ -f "$CF" ]]; then echo "  nginx        [问题] $CF 里没有本脚本写的反向代理（被宝塔重新生成/手改过，或端口变了）→ bash install.sh --nginx"
    else echo "  nginx        没找到宝塔站点配置 $CF；示例在 $DIR/nginx.$DOMAIN.conf（宝塔先建站点再 bash install.sh --nginx）"; fi
    printf '  %-40s → %s\n' "https://$DOMAIN/api/health" "$(curl -sk -o /dev/null -w '%{http_code}' --max-time 8 "https://$DOMAIN/api/health" || echo 无响应)"
  else echo "  nginx        没记录域名：bash install.sh --nginx --domain=你的域名"; fi
  exit 0
fi
if [[ $ACTION == stop || $ACTION == start || $ACTION == restart ]]; then
  case $ACTION in stop) svc_stop; ok "$APP 已停";; start) svc_start; ok "$APP 已启动";; restart) svc_restart; ok "$APP 已重启";; esac
  sleep 1; svc_status; exit 0
fi
if [[ $ACTION == rollback ]]; then
  PREV="$(cat "$DIR/previous" 2>/dev/null || true)"; [[ -n "$PREV" && -d "$DIR/releases/$PREV" ]] || fail "没有可回退的上一版本"
  CUR="$(basename "$(readlink -f "$DIR/current")")"; ln -sfn "$DIR/releases/$PREV" "$DIR/current"; echo "$CUR" > "$DIR/previous"
  svc_restart; ok "已从 $CUR 回退到 $PREV（.env 和缓存在 shared/ 不动）"; sleep 2; svc_status
  H="$(health "$PORT" 5)"; [[ -n "$H" ]] && ok "/api/health $H" || echo "  [注意] 回退后 /api/health 还没响应，稍等再 bash install.sh --status"
  exit 0
fi

# ---------- 探测：Node / 端口 / 托管方式 / 磁盘 / 内存 ----------
port_listening() { ss -ltnH "sport = :$1" 2>/dev/null | grep -q . || (command -v netstat >/dev/null && netstat -ltn 2>/dev/null | awk '{print $4}' | grep -q ":$1$"); }
port_owner() {   # 输出 "进程名 pid"；在监听但看不到进程输出 "未知 ?"；没人占输出空
  port_listening "$1" || return 0
  local line; line="$(ss -ltnpH "sport = :$1" 2>/dev/null | head -1 | grep -o 'users:(("[^"]*",pid=[0-9]*' | head -1 | sed 's/users:(("//; s/",pid=/ /')"
  [[ -z "$line" && -x "$(command -v netstat)" ]] && line="$(netstat -ltnp 2>/dev/null | awk -v p=":$1$" '$4 ~ p {print $7; exit}' | sed 's#^\([0-9]*\)/\(.*\)$#\2 \1#')"
  echo "${line:-未知 ?}"
}
free_port() { local p=$1; while port_listening "$p"; do p=$((p + 1)); done; echo "$p"; }
check_port() {   # 被本系统的 quanjian 占着=正常（更新会重启）；被别的进程占着=自动顺延到下一个空闲端口
  local o; o="$(port_owner "$PORT")"
  if [[ -z "$o" ]]; then ok "端口 $PORT 空闲"; return 0; fi
  local proc="${o%% *}" pid="${o##* }" mine=0 cwd=""
  if [[ "$pid" =~ ^[0-9]+$ ]]; then
    [[ "$(ps -o unit= -p "$pid" 2>/dev/null | tr -d ' ')" == "$APP.service" ]] && mine=1
    cwd="$(readlink -f /proc/"$pid"/cwd 2>/dev/null || true)"; [[ -n "$cwd" && "$cwd" == "$(readlink -f "$DIR")/releases/"* ]] && mine=1
  fi
  if [[ $mine -eq 1 ]]; then ok "端口 $PORT 被本系统的 $APP 占着（更新会重启它）"; return 0; fi
  local np; np="$(free_port $(( PORT + 1 )))"
  echo "  [改端口] 端口 $PORT 被 ${proc:-未知进程}（pid ${pid:-?}）占用，自动改用 $np（记到 $CONF，下次沿用；nginx 反代会跟着写新端口）"; PORT="$np"; PORTS_CHANGED=1
}
env_check() {
  step "探测：Node / 端口 / 托管方式 / 磁盘 / 内存"
  local bad=0; PORTS_CHANGED=0
  if command -v node >/dev/null 2>&1; then NODEV="$(node -v | sed 's/^v//')"; if [[ ${NODEV%%.*} -ge 18 ]]; then ok "Node $NODEV（$(command -v node)）"; else echo "  [冲突] Node 需要 ≥ 18，当前 $NODEV"; bad=1; fi
  else echo "  [冲突] 没有 node：装 Node ≥ 18（宝塔：软件商店 → Node.js 版本管理器；或 https://nodejs.org）"; bad=1; fi
  command -v unzip >/dev/null 2>&1 && ok "unzip" || { echo "  [冲突] 缺 unzip：apt install unzip / yum install unzip"; bad=1; }
  if [[ $RUNNER == systemd ]]; then
    if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then ok "systemd 可用（服务单元 $APP.service）"; else echo "  [冲突] 这台机器没有 systemd（容器/精简系统）：加 --pm2 用 pm2 托管"; bad=1; fi
  else
    if command -v pm2 >/dev/null 2>&1; then ok "pm2 $(pm2 -v 2>/dev/null | tail -1)"; elif command -v npm >/dev/null 2>&1; then echo "  [注意] 没装 pm2，安装时会 npm i -g pm2（需要能访问 npm 源）"; else echo "  [冲突] --pm2 需要 npm 来装 pm2"; bad=1; fi
  fi
  check_port
  if [[ $PORTS_CHANGED -eq 1 && $MODE == update ]]; then sed -i "s/^PORT=.*/PORT=$PORT/" "$SHARED/.env" 2>/dev/null || true; ok "$SHARED/.env 的 PORT 已同步为 $PORT"; fi
  local avail; avail="$(df -Pm "$(dirname "$DIR")" 2>/dev/null | awk 'NR==2{print $4}')"; if [[ -n "$avail" ]]; then if (( avail < 512 )); then echo "  [冲突] 磁盘剩余 ${avail} MB，至少要 512 MB（包解开 + 静态图缓存）"; bad=1; else ok "磁盘剩余 $((avail / 1024)) GB"; fi; fi
  local mem; mem="$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo 2>/dev/null)"; if [[ -n "$mem" ]]; then if (( mem < 200 )); then echo "  [注意] 可用内存只有 ${mem} MB，Next 服务至少要 200 MB，可能起不来"; else ok "可用内存 ${mem} MB"; fi; fi
  if [[ $bad -ne 0 ]]; then echo; echo "  探测有问题，没有开始安装。处理后重跑；只想再探测一遍：bash install.sh --check"; exit 1; fi
}

if [[ $ACTION == uninstall ]]; then
  [[ -d "$DIR" ]] || fail "$DIR 不存在，没装过或已卸载"
  echo "=================================================="; echo "  卸载 圈见（$DIR）"; echo "=================================================="
  echo "  会做：停掉并删除 $APP 服务（$RUNNER）；删除 $DIR 全部文件（含 shared/.env 和缓存）"
  BK="/root/quanjian-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
  read -rp "  确认卸载？输入 yes 继续: " y; [[ "$y" == yes ]] || { echo "  已取消"; exit 0; }
  step "备份配置 → $BK"; BKF=(); for f in shared/.env install.conf; do [[ -f "$DIR/$f" ]] && BKF+=("$f"); done
  [[ ${#BKF[@]} -gt 0 ]] && tar -czf "$BK" -C "$DIR" "${BKF[@]}" 2>/dev/null && ok "已备份（.env 里有服务端 AK，恢复时解到新安装目录）" || echo "  [注意] 备份失败（没有 .env？），继续卸载"
  step "停服务"; svc_remove; ok "$APP 已停并删除"
  step "删文件"; rm -rf "$DIR"; ok "$DIR 已删除"
  echo; echo "  卸载完成。备份在 $BK；nginx 里 quanjian-proxy-start/end 之间的反向代理请自己删掉（bash install.sh --nginx 写的那段）"; exit 0
fi

# ---------- nginx：宝塔站点配置里写反向代理块（含 SSE 三行）；没有站点配置就给完整示例 ----------
proxy_block() { cat <<NGX
    # quanjian-proxy-start（由 install.sh 写入 $(date '+%Y-%m-%d %H:%M')，重跑 bash install.sh --nginx 会整段替换；证书等其它内容不动）
    # 程序装在站点目录里，这些路径绝不能当静态文件放出去（.env 有服务端 AK、zip 是整套程序）
    location ^~ /shared/   { return 404; }
    location ^~ /releases/ { return 404; }
    location ^~ /current/  { return 404; }
    # 全部交给 Node（页面、_next 静态资源、/api）。^~ 压过宝塔自带的 .js/.css/.png 静态缓存规则和 PHP 规则
    # 街道体检的进度是 SSE 流：proxy_buffering off + 长 read_timeout + HTTP/1.1，少一行进度就卡住
    location ^~ / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
    }
    # quanjian-proxy-end
NGX
}
nginx_example() {   # 完整站点示例 → $DIR/nginx.<域名>.conf
  local f="$DIR/nginx.$DOMAIN.conf" logdir=/var/log/nginx; [[ -d /www/wwwlogs ]] && logdir=/www/wwwlogs
  { echo "# 圈见 nginx 站点配置示例（由 install.sh 生成）"
    echo "#   宝塔：网站 → 添加站点 $DOMAIN（纯静态，根目录随便填）→ 再跑 bash install.sh --nginx，脚本会把下面 quanjian-proxy-start/end 那段写进站点配置"
    echo "#   普通 nginx：整个文件放到 /etc/nginx/conf.d/$DOMAIN.conf，nginx -t && nginx -s reload；HTTPS 用 certbot --nginx -d $DOMAIN"
    echo "server {"; echo "    listen 80;"; echo "    server_name $DOMAIN;"; echo "    client_max_body_size 32m;"; echo
    proxy_block; echo
    echo "    access_log  $logdir/$DOMAIN.log;"; echo "    error_log   $logdir/$DOMAIN.error.log;"; echo "}"
  } > "$f"; echo "$f"
}
nginx_apply() {
  [[ -n "$DOMAIN" ]] || { echo "  [跳过] 没有域名，nginx 没配：bash install.sh --nginx --domain=你的域名"; return 0; }
  local CONFF="/www/server/panel/vhost/nginx/$DOMAIN.conf" ex
  if [[ ! -f "$CONFF" ]]; then
    ex="$(nginx_example)"
    if [[ -d /www/server/panel ]]; then echo "  [提示] 宝塔里还没有站点 $DOMAIN（$CONFF 不存在）：网站 → 添加站点 $DOMAIN（纯静态）后再跑 bash install.sh --nginx"
    else echo "  [提示] 不是宝塔环境，反向代理自己配：完整示例已生成 $ex（放到 /etc/nginx/conf.d/ 后 nginx -s reload）"; fi
    return 0
  fi
  command -v nginx >/dev/null || { echo "  [跳过] 找到站点配置但没有 nginx 命令，没改：示例 $(nginx_example)"; return 0; }
  local bk="$CONFF.bak-$(date +%Y%m%d-%H%M%S)"; cp -a "$CONFF" "$bk"
  local BLK; BLK="$(mktemp)"; proxy_block > "$BLK"
  # 去掉上次写的块（标记之间）和旧版脚本写的 location /，再把新块插到 server{} 最后一个 } 前面
  awk -v blk="$BLK" '
    /quanjian-proxy-start/ { skip=1 }
    skip && /quanjian-proxy-end/ { skip=0; next }
    /quanjian 反向代理（install.sh 写入）/ { skip2=1; next }
    skip2 && /^[[:space:]]*}[[:space:]]*$/ { skip2=0; next }
    skip || skip2 { next }
    { lines[++n]=$0 }
    END {
      last=0; for (i=n; i>=1; i--) if (lines[i] ~ /^[[:space:]]*}[[:space:]]*$/) { last=i; break }
      if (last==0) exit 3
      for (i=1; i<=n; i++) { if (i==last) { while ((getline l < blk) > 0) print l; print "" } print lines[i] }
    }' "$CONFF" > "$CONFF.tmp" || { rm -f "$CONFF.tmp" "$BLK"; echo "  [失败] $CONFF 里找不到 server{} 的结尾，没改；示例 $(nginx_example)"; return 0; }
  rm -f "$BLK"; mv "$CONFF.tmp" "$CONFF"
  if nginx -t >/dev/null 2>&1; then
    timeout 20 nginx -s reload 2>/dev/null || timeout 20 systemctl reload nginx 2>/dev/null || /etc/init.d/nginx reload >/dev/null 2>&1 || true
    ok "nginx 已写好反向代理：$CONFF（备份 $bk；$(grep -q 'ssl_certificate' "$CONFF" && echo '已有证书，HTTPS 可用' || echo '还没证书：宝塔里给站点一键申请 SSL 并开强制 HTTPS，不用再跑脚本')）"
    local h; h="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 -H "Host: $DOMAIN" "http://127.0.0.1/api/health" || true)"
    [[ "$h" == 200 ]] && ok "经 nginx 访问 http://$DOMAIN/api/health → $h" || echo "  [注意] 经 nginx 访问 /api/health → ${h:-无响应}（服务没起？或宝塔开了强制 HTTPS 会回 301/307，浏览器打开 https://$DOMAIN 看）"
  else
    echo "  [失败] nginx 配置语法不过，已还原 $CONFF："; nginx -t 2>&1 | tail -3 | sed 's/^/  | /'; cp -a "$bk" "$CONFF"
  fi
}

# ---------- 找包 ----------
if [[ -z "$ZIP" ]]; then ZIP="$(ls -1 "$HERE"/quanjian-*.zip 2>/dev/null | grep -v -- '-src-' | sort -V | tail -1 || true)"; fi
if [[ $ACTION == install ]]; then [[ -n "$ZIP" && -f "$ZIP" ]] || fail "没找到安装包：把 quanjian-<版本>.zip 放到本脚本同目录，或 bash install.sh 包路径"; ZIP="$(readlink -f "$ZIP")"; fi
MODE="install"; [[ -f "$SHARED/.env" ]] && MODE="update"
echo "=================================================="
if [[ $ACTION == nginx ]]; then WHAT='nginx 反向代理'; elif [[ $ACTION == check ]]; then WHAT='只探测'; elif [[ $MODE == update ]]; then WHAT='更新'; else WHAT='全新安装'; fi
echo "  圈见 · $WHAT"
echo "  包：$([[ -n "$ZIP" && $ACTION == install ]] && basename "$ZIP" || echo '（无）')    目录：$DIR    托管：$RUNNER"
echo "=================================================="

# ---------- 读/定配置 ----------
if [[ $MODE == install && $ACTION == install ]]; then
  [[ -n "$SERVER_AK" || ! -t 0 ]] || { read -rp "百度地图【服务端】AK（不填=只能看内置样例，以后改 $SHARED/.env）: " SERVER_AK; }
  [[ -n "$DOMAIN" || ! -t 0 ]] || { read -rp "访问域名（宝塔已建好的站点，可空跳过，以后 bash install.sh --nginx --domain=xx）: " DOMAIN; }
fi
if [[ $ACTION == nginx ]]; then [[ -n "$DOMAIN" || ! -t 0 ]] || { read -rp "域名: " DOMAIN; }; [[ -n "$DOMAIN" ]] || fail "要域名：bash install.sh --nginx --domain=你的域名"; mkdir -p "$DIR"; save_conf; step "nginx"; nginx_apply; exit 0; fi
env_check
mkdir -p "$DIR"; save_conf "$CONF.tmp"
if [[ $ACTION == check ]]; then mv "$CONF.tmp" "$CONF"; echo; echo "  探测通过：可以安装/更新（bash install.sh）；端口 $PORT、托管方式 $RUNNER 已记住"; exit 0; fi

# ---------- 解压 ----------
step "解压"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
unzip -q "$ZIP" -d "$TMP" || [[ $? -eq 1 ]]   # Windows 打的包路径警告退出码 1，放行
PKG="$(find "$TMP" -maxdepth 2 -name VERSION -printf '%h\n' | head -1)"; [[ -n "$PKG" ]] || fail "包里没有 VERSION 文件，不是 pack 打出来的包"
VER="$(tr -d '[:space:]"' < "$PKG/VERSION")"; REL="$DIR/releases/$VER"
for f in server.js .next .env.example; do [[ -e "$PKG/$f" ]] || fail "包里缺 $f，不是 standalone 包"; done
mkdir -p "$DIR/releases" "$SHARED/data/cache"
[[ -d "$REL" ]] && { echo "  版本 $VER 已存在，覆盖重装"; rm -rf "$REL"; }
mv "$PKG" "$REL"; chmod +x "$REL/start.sh" 2>/dev/null || true; ok "版本 $VER → $REL"

# ---------- 共享文件挂进去 ----------
step "配置文件（跨版本保留在 $SHARED）"
if [[ $MODE == install ]]; then
  cp "$REL/.env.example" "$SHARED/.env"; sed -i 's/\r$//' "$SHARED/.env"
  [[ -n "$SERVER_AK" ]] && sed -i "s#^BAIDU_SERVER_AK=.*#BAIDU_SERVER_AK=$SERVER_AK#" "$SHARED/.env"
  printf '\n# --- 由 install.sh 追加：运行参数（改完 bash install.sh --restart）---\nNODE_ENV=production\nHOSTNAME=127.0.0.1\nPORT=%s\n' "$PORT" >> "$SHARED/.env"
  chmod 600 "$SHARED/.env"; ok "生成 $SHARED/.env（服务端 AK $([[ -n "$SERVER_AK" ]] && echo 已写入 || echo '未填，仍是占位符')）"
else
  grep -q '^PORT=' "$SHARED/.env" && sed -i "s/^PORT=.*/PORT=$PORT/" "$SHARED/.env" || printf 'PORT=%s\n' "$PORT" >> "$SHARED/.env"
  ok "沿用已有 .env（改 AK/端口直接编辑 $SHARED/.env 再 bash install.sh --restart）"
fi
grep -q '^BAIDU_SERVER_AK=your_server_ak_here' "$SHARED/.env" && echo "  [注意] BAIDU_SERVER_AK 还是占位符，实时分析不可用，只能看内置样例（改 $SHARED/.env 后 --restart）"
ln -sfn "$SHARED/.env" "$REL/.env"
rm -rf "$REL/data/cache"; mkdir -p "$REL/data"; ln -sfn "$SHARED/data/cache" "$REL/data/cache"; chmod -R a+rwX "$SHARED/data/cache"
ok "磁盘缓存目录 → $SHARED/data/cache（可随时清空）"

# ---------- 兜底：包里 Next 依赖不完整（Windows/pnpm 打的包符号链接失效）就在服务器上补装 ----------
if ! node -e "const p=require('path').dirname(require.resolve('next/package.json',{paths:['$REL']}));require.resolve('styled-jsx/package.json',{paths:[p]})" >/dev/null 2>&1; then
  echo "  [修复] 包里的 Next 依赖不完整（pnpm 符号链接布局没打进来），在服务器上补装（需要能访问 npm 源）…"
  (cd "$REL" && rm -rf node_modules && npm i --omit=dev --no-audit --no-fund --loglevel=error next@14.2.35 react@18.3.1 react-dom@18.3.1 echarts@5.5.1 zod@3.23.8) && ok "依赖已补装" || fail "依赖补装失败：服务器上不了 npm 源？在能上网的机器重新 pack（见 docs/deploy.md）"
fi

# ---------- 服务 ----------
step "服务（$RUNNER）"
NODE_BIN="$(command -v node)"
if [[ -n "${CONF_RUNNER:-}" && "$CONF_RUNNER" != "$RUNNER" ]]; then RUNNER="$CONF_RUNNER" svc_remove; ok "托管方式从 $CONF_RUNNER 换成 $RUNNER，旧的已清掉"; fi
if [[ $RUNNER == systemd ]]; then
  cat > "$UNIT" <<EOF
[Unit]
Description=quanjian (圈见) Next.js standalone
After=network.target
[Service]
WorkingDirectory=$DIR/current
EnvironmentFile=$SHARED/.env
ExecStart=$NODE_BIN server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload; ok "已写 $UNIT"
else
  command -v pm2 >/dev/null 2>&1 || { echo "  装 pm2…"; npm i -g pm2 --loglevel=error >/dev/null || fail "pm2 装不上：npm i -g pm2 手动装，或不加 --pm2 用 systemd"; }
  ok "pm2 $(pm2 -v 2>/dev/null | tail -1)（开机自启：pm2 startup 按提示执行一次）"
fi

# ---------- 切换版本并重启 ----------
step "切换到 $VER"
CUR="$(basename "$(readlink -f "$DIR/current" 2>/dev/null)" 2>/dev/null || true)"
[[ -n "$CUR" && "$CUR" != "$VER" && -d "$DIR/releases/$CUR" ]] && echo "$CUR" > "$DIR/previous"
ln -sfn "$REL" "$DIR/current"; mv "$CONF.tmp" "$CONF"
[[ $RUNNER == systemd ]] && systemctl enable -q "$APP"
svc_restart
# 只留最近 3 个版本
ls -1 "$DIR/releases" | sort -V | head -n -3 | while read -r old; do [[ "$old" != "$VER" && "$old" != "$(cat "$DIR/previous" 2>/dev/null)" ]] && rm -rf "$DIR/releases/$old"; done || true

# ---------- 健康检查 ----------
step "健康检查"
BAD=0; H=""
for i in 1 2 3 4 5 6 7 8 9 10; do H="$(health "$PORT" 3)"; [[ -n "$H" ]] && break; sleep 2; done
if [[ -n "$H" ]]; then
  ok "http://127.0.0.1:$PORT/api/health → $H"
  echo "$H" | grep -q '"hasServerAk":true' || echo "  [注意] hasServerAk=false：实时分析不可用（内置样例可看）。填好 $SHARED/.env 的 BAIDU_SERVER_AK 后 bash install.sh --restart"
else
  BAD=1; echo "  [异常] http://127.0.0.1:$PORT/api/health 无响应（服务状态：$(svc_active)）"
  echo "  ---- $APP 最近日志 ----"; svc_logs 25 | sed 's/^/  | /' | tail -25
  echo "  ---- 常见原因：Node 版本 <18（node -v）；端口被占（bash install.sh --check）；包在 Windows 打的少了文件（看 $DIR/current/node_modules/next 是否存在）----"
fi

step "nginx"; nginx_apply

echo
echo "=================================================="
if [[ $BAD -eq 0 ]]; then
  echo "  $([[ $MODE == update ]] && echo '更新' || echo '安装')完成：版本 $VER"
  if [[ $KEEP_ZIP -eq 0 ]]; then rm -f "$ZIP"; echo "  安装包已删除（程序已在 $REL；想保留加 --keep-zip）"; fi
else echo "  已切换到 $VER，但服务不正常，按上面提示查日志（安装包保留，修好后可重跑）"; fi
echo "  本机  http://127.0.0.1:$PORT      健康  http://127.0.0.1:$PORT/api/health${DOMAIN:+      站点  https://$DOMAIN}"
[[ $MODE == install ]] && { echo "  百度控制台：浏览器端 AK 的 Referer 白名单加 ${DOMAIN:-你的域名}/*（子域多就 *.${DOMAIN#*.}/*）；服务端 AK 的 IP 白名单含本机公网 IP"; echo "  配置在 $SHARED/.env（服务端 AK、端口），改完 bash install.sh --restart"; true; }
echo "  下次更新：把新 zip 和本脚本传到同目录，再跑一遍 bash install.sh；出问题 bash install.sh --rollback；看状态 bash install.sh --status"
echo "=================================================="
