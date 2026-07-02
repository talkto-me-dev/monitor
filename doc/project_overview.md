# Monitor — 服务状态监控系统（原 status）

## 定位

定时（每 60 秒）探测多台 VPS 上的多种服务，异常时通过飞书/PushPlus 告警，恢复时推送恢复通知，异常记录持久化到 PostgreSQL。

---

## 技术栈

| 分类   | 技术                                                                                     |
| ------ | ---------------------------------------------------------------------------------------- |
| 运行时 | **Bun**（非 Node，因 fetch 需要 proxy 参数；DB 驱动用内置 `Bun.sql`）                    |
| 数据库 | **PostgreSQL**（`Bun.sql` 原生驱动，零额外依赖，库名 `status`）                          |
| 缓存   | **Redis**（ioredis）                                                                     |
| 线程池 | **Piscina**（每种探测任务在 worker 线程执行，idle 90s）                                  |
| 配置   | `.env`（唯一秘密来源）+ `conf/watch.yml`（秘密用 `${VAR}` 占位符）+ `conf/ip.json`；conf/ 不入仓 |
| 告警   | `@8v/send`（飞书 Lark + PushPlus 双通道，至少配一个）                                    |
| 部署   | systemd service，`deploy.sh` SSH 到 VPS 拉代码 + scp .env 和 conf/ + 重启                |
| 开发   | `watchexec` 监听 `src/*.js` 变动，自动 `oxfmt` → `oxlint` → 运行                         |

---

## 配置（重构后：无外部 conf 仓库依赖）

- **`.env`**（项目根，不入仓，权限 600）：所有秘密与连接信息。模板见 `.env.example`，键分五组：
  - `DB_*`：PostgreSQL 连接（HOST/PORT/USER/PASSWORD/NAME，可选 `DB_SSL` JSON）
  - `REDIS_*`：Redis 连接
  - `LARK` / `PUSHPLUS` + `PUSHPLUS_TOPIC`：告警通道（至少一个）
  - `GOOGLE_TRAN`：Google 翻译 API Key（ipv6_proxy 探测用）
  - `SENTINEL_PASSWORD` / `IPV6_PROXY_AUTH` / `SMTP_PASSWORD`：watch.yml 占位符引用；`DEPLOY_VPS`：部署目标
- **加载机制**：bun 启动时自动加载工作目录下的 `.env`（dev 与 systemd 均依赖此机制，`monitor.service` 的 `WorkingDirectory=/opt/monitor`）；`src/env.js` 统一装配并校验（缺关键项启动即报错），装配逻辑在 `src/loadEnv.js`（纯函数，可测）。
- **`conf/`（不入仓——仓库公开，含真实 IP 与监控拓扑；deploy.sh 部署时随 `.env` 一起 scp）**：`watch.yml`（监控拓扑，密码写成 `${SENTINEL_PASSWORD}` 等占位符，由 `src/loadYml.js` 的 `envRef` 在解析后递归替换）+ `ip.json`（VPS 主机名 → IP）。
- 本地开发数据库：docker 容器 `status-pg`（postgres:16，端口 127.0.0.1:5432，volume `status-pg-data`）。

---

## 目录结构

```
monitor/
├── .env               # 真实配置（不入仓；本地与服务器各一份）
├── .env.example       # 配置模板（入仓）
├── conf/              # 不入仓，deploy.sh 部署时 scp
│   ├── watch.yml      # 监控任务配置（核心，秘密为 ${VAR} 占位符）
│   └── ip.json        # VPS hostname → IPv4/IPv6 映射
├── src/
│   ├── main.js        # 入口：加载配置 → 注册任务 → 60s 轮询
│   ├── env.js         # 环境变量统一装配（fail-fast）
│   ├── loadEnv.js     # env → 配置对象（纯函数）
│   ├── SRV.js         # 服务注册表：ipv6_proxy / redis_sentinel / smtp
│   ├── Watch.js       # 每轮执行：并发 ping 所有任务 → statusWatch
│   ├── ping.js        # 单次探测：线程池执行 → 成功/失败处理
│   ├── statusWatch.js # 监控自身：检查 cloudflare monitor-watch 是否存活
│   ├── send.js        # 告警发送
│   ├── DB.js          # PostgreSQL 连接（Bun.sql），导出 q / isDup
│   ├── R.js           # Redis 连接
│   ├── loadYml.js     # 从 conf/ 加载 YAML + ${VAR} 环境变量插值
│   ├── loadJson.js    # 从 conf/ 加载 JSON
│   ├── ping/          # 具体探测实现（每种服务一个文件；dohData.js 为 DoH 查询工具，零记录时返回空数组）
│   ├── db/            # 数据库操作
│   │   ├── ERR.js         # 内存异常状态（启动时从 errIng 表加载）
│   │   ├── errIngNew.js   # 新异常：upsert errIng + 推送告警
│   │   ├── recover.js     # 恢复：删 errIng → 写 errFixed → 推送恢复通知
│   │   ├── VPS_ID_IP.js   # hostname → [id, ip]（启动时同步到 DB）
│   │   ├── VPS_IP.js / VPS_IP_NAME.js
│   │   ├── srvId.js       # 服务名 → id
│   │   ├── txtId.js       # 错误文本 → id（blake3 去重，原 @3-/txt_id 内联）
│   │   └── valId.js       # 通用 val→id（原 @3-/val_id 内联）
│   └── var/           # 线程池与 worker 入口
├── backup/
│   ├── schema.sql     # PostgreSQL 建表（新库初始化用）
│   ├── migrate.js     # 一次性 TiDB → PG 数据迁移（可重复执行）
│   └── dump.sh        # pg_dump 导出表结构
├── test/              # bun test 单元测试 + R.js 手工冒烟
├── deploy.sh          # 部署：拉代码 + scp .env + 重启
├── dev.sh             # 开发热重载（项目根运行，bun 自动加载 .env）
├── log.sh             # 查看 journalctl 日志
└── monitor.service    # systemd 服务配置（无需 EnvironmentFile）
```

---

## 数据库（PostgreSQL，库名 `status`）

建表见 `backup/schema.sql`。标识符一律不加引号（PG 折叠小写，代码里的 `errIng` 实为 `erring` 表）。

| 表         | 用途           | 关键字段                                    |
| ---------- | -------------- | ------------------------------------------- |
| `vps`      | VPS 节点       | hostname（唯一）、ip（bytea）               |
| `srv`      | 服务名         | val（唯一，如 `redis_sentinel/cluster-a`）  |
| `txt`      | 错误文本去重   | hash（blake3，bytea 唯一）、val             |
| `errIng`   | 正在发生的异常 | vps_id + srv_id（联合唯一）、txt_id、ts     |
| `errFixed` | 已恢复的异常   | id 沿用 errIng（非自增）+ begin、duration   |

DB 层约定（`src/DB.js`）：

- `DB.q(sql, ...arg)`：`$n` 占位符，返回**数组行**；`IN` 列表用代码动态生成 `($1,$2,...)`（Bun.sql 不支持 `ANY($1)` 传 JS 数组）
- **PG 的 bigint 列返回字符串**（如 `"1"`）——全链路 id 只做 Map 键/模板内插/数值减法，字符串自洽，不要引入数字比较
- upsert 用 `ON CONFLICT ... DO UPDATE ... RETURNING id`（两分支 id 均正确）；唯一键冲突判断用 `DB.isDup(err)`（errno `"23505"`）

---

## 当前监控的 VPS 与服务

见 `conf/ip.json`（主机名 → IP 映射）与 `conf/watch.yml`（监控项定义），两者均不入仓。

### 探测方式

| 服务             | 探测逻辑                                                                     |
| ---------------- | ---------------------------------------------------------------------------- |
| `ipv6_proxy`     | 通过各 VPS 的 IPv6 代理请求 Google 翻译 API，断言 `"I"` → `"我"`             |
| `redis_sentinel` | 连接哨兵节点，检查：哨兵存活、主库状态、主从关系一致、从库数 ≥ 2、集群完整   |
| `smtp`           | Cloudflare DoH 查 A/AAAA 记录校验 DNS 解析 → 对每个 VPS 做 TLS SMTP 登录测试 |

---

## 核心流程

```
main.js 启动
  → env.js 校验 .env（缺项即挂）
  → loadYml("watch")：解析 conf/watch.yml + ${VAR} 占位符替换
  → 对每个 srv_tag：查/建 srv_id → 按 SRV[srv] 解析参数 → push 到 TASK Map
  → 立即执行 watch() + setInterval 60s 循环

watch()
  → 遍历 TASK，并发执行 ping()
  → ping():
    → Piscina worker 线程执行 ping/{srv}.js（30s 超时 AbortController）
    → 成功 + 之前有异常 → recover（删 errIng → 写 errFixed → 推送 ✅ + 剩余异常数）
    → 成功 + 无异常 → log ✅
    → 失败 + 与上次相同错误文本 → 跳过（不重复告警）
    → 失败 + 新错误 → errIngNew（upsert errIng → 推送 ❌）
  → statusWatch():
    → 读 Redis key `status-watch:ts`，检查 cloudflare status-watch 最后心跳
    → 写 `status:ts` 作为自身心跳
    → 若失联/未运行，在内部 catch 并发送告警（首次发生时通知，后续静默，不重复轰炸且不向外抛错，保证主程序不崩溃）
```

---

## 添加新监控

改 `conf/watch.yml` → `src/SRV.js` → `src/ping/<srv>.js`，详细步骤、push 数据契约与完整示例见 [add-monitor.md](add-monitor.md)。

---

## 测试

- `bun test`：单元测试（`test/*.test.js`，覆盖 loadEnv 装配校验、yml 占位符插值），不连外部服务
- `bun test/R.js`：Redis 手工冒烟（连真实 Redis）
- 本地整体验证：`./dev.sh`（连本地 docker PG `status-pg` + 真实 Redis，会真实推送告警——调试时可用环境变量覆盖 `LARK` 指向 mock）

---

## 部署

- 部署目标：`.env` 的 `DEPLOY_VPS`（ssh 别名）
- 服务器路径：`/opt/monitor`；代码托管 `github.com:talkto-me-dev/monitor.git`（`main` 分支）
- 流程：`deploy.sh` → SSH 拉代码 → `scp .env` 到 `/opt/monitor/.env`（chmod 600）→ `bun i` → `systemctl restart monitor`
- systemd：`monitor.service`，`WorkingDirectory=/opt/monitor`，bun 自动加载该目录下 `.env`，无需 EnvironmentFile；首次安装见 deploy.sh 尾部注释（含旧 status 服务退役步骤）
- **服务器首次切换 PG（顺序不能乱）**：① `psql < backup/schema.sql` 建库 → ② 保持 status 服务未启动（或先 `systemctl stop status`）→ ③ 如需保留 TiDB 历史数据跑 `MYSQL_URL=... bun backup/migrate.js`（迁移必须先于应用首次写入，否则新旧 id 错位；脚本检测到目标库已有数据会拒绝，确认无误可加 `--force`；自动校正自增序列，errIng 序列会同时越过 errFixed 的历史 id）→ ④ 再启动服务/执行 deploy.sh

---

## 注意事项（2026-07 重构后）

- 已彻底移除对外部 conf 仓库（软链）与 TiDB/mysql 的依赖：`@8v/mysql`、`@3-/txt_id`、`@3-/val_id`、`patch-package`、sqlstring 补丁均已删除；txt_id/val_id 逻辑内联进 `src/db/`
- `.env` 同时被 bun 和 bash（deploy.sh/dump.sh source）解析，值一律用单引号包裹
- sibling 仓库 `monitor-watch` 的 `setEnv.sh` 已改为从自身 `.dev` 取值，旧 conf 仓库已不被任何项目引用，但作为秘密的原始来源暂不删除
- `src/var/WATCH.js` 导出空 Map，代码中未被引用，疑似遗留
- `README.mdt` 扩展名拼写有误，应为 `.md`
- `statusWatch` 与 sibling 的 `cloudflare monitor-watch` Worker 互相监控（通过 Redis 心跳，键名 `status:ts`/`status-watch:ts` 为历史遗留）
- 本地开发与服务器如各用独立 PG，异常状态（errIng）不再共享，本地 dev 运行会独立告警一份（原 TiDB 时代共库去重的行为不再存在）
