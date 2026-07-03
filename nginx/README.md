# nginx / openresty 5xx 监控

> 本目录是通用模板/原理说明。**实际部署**在 nix 仓库：`nix/vps/openresty/lua/`（本目录两个 lua 的拷贝）+ `stat.conf`（shared dict、http 级 log_by_lua、9145 统计 server 与 token），`nix/soft/openresty.nix` 负责 /etc 映射与防火墙 9145。改 lua 时两处同步。

原理：log 阶段按 `服务名 × 状态码` 在 `lua_shared_dict` 里做**单调递增**计数（跨 worker 原子、reload 保留、restart 清零），`/monitor-stat` 端点输出 JSON；监控端每轮（60s）拉取后与上一轮快照做 delta 判阈值。没有分钟分桶，也就没有"分钟边界与拉取周期不对齐导致漏检/重复告警"的竞态。

## nginx 侧接入（OpenResty，或带 lua-nginx-module + cjson 的 nginx）

1. 把本目录两个 lua 文件放到服务器，如 `/etc/nginx/monitor/`
2. `http{}` 里声明共享内存（状态码 key 数量有界，1m 足够）：

   ```nginx
   lua_shared_dict monitor_stat 1m;
   ```

3. 每个要统计的 `server{}` 里 include 统计脚本：

   ```nginx
   log_by_lua_file /etc/nginx/monitor/stat.lua;
   # 服务名默认取 server_name，要自定义时：
   # set $monitor_srv "my-api";
   ```

   没有 server_name 的 server（如默认 server）必须 `set $monitor_srv`，否则统计会被静默丢弃。

   ⚠️ `log_by_lua` 同一 phase 只生效最里层一个：若 server/location 已有其它 log_by_lua，需手动合并进去，否则统计会静默丢失。

4. 暴露统计端点。推荐独立 server 监听专用端口（也可挂在现有 server 的 location 上）：

   ```nginx
   server {
     listen 9145;
     location = /monitor-stat {
       access_log off;
       set $monitor_token "与监控端 .env 的 NGINX_STAT_TOKEN 相同的值";
       content_by_lua_file /etc/nginx/monitor/report.lua;
     }
   }
   ```

   端点走公网时 token 必须设。注意 token 走明文 HTTP 只能防扫描、不能防链路嗅探（server_name 拓扑会泄露给链路观察者）——拓扑敏感时用内网监听（`listen 127.0.0.1:9145` / 内网 IP，此时可不设 token）或把端点挂到现有 HTTPS server 的 location 上。

5. 验证：

   ```
   curl -H "x-token: xxx" http://127.0.0.1:9145/monitor-stat
   → {"start":1751500000,"srv":{"api.example.com":{"total":123,"502":1}}}
   ```

## 监控端配置（conf/watch.yml）

```yaml
nginx:
  port: 9145 # 统计端点端口，默认 80
  path: /monitor-stat # 默认 /monitor-stat
  token: ${NGINX_STAT_TOKEN} # 端点不设 token 时可省
  max_5xx: 3 # 每分钟 5xx 增量 ≥ 此值告警（各服务独立判断），默认 3，必须 ≥ 1（配 0 会每轮告警）
  vps:
    - c-us-01
```

`.env` / `.env.example` 补 `NGINX_STAT_TOKEN`。每台 vps 独立探测、独立告警；一台 nginx 上多个服务（server_name）的超标信息合并在同一条告警文本里，按服务名分行。

## 告警语义

- 首轮、nginx restart（start 变化）、计数回退：只记快照，不判断
- 阈值按"每分钟增量"折算：上一轮探测失败导致间隔拉长时，按实际间隔归一化，不会把两分钟的量当一分钟误报
- 告警文本只含服务名与阈值（不含实测值），连续超标只告警一次，回落后自动恢复
- 统计端点本身拉不通（连接拒绝/超时/非 200）会作为独立告警，通常意味着 nginx 挂了
