# CLAUDE.md

## 项目定位

Monitor（原 status）：每 60 秒探测多台 VPS 上的服务（redis_sentinel / smtp / nginx 等），异常经飞书 + PushPlus 告警，记录持久化到 PostgreSQL。与 sibling 项目 `monitor-watch`（Cloudflare Worker）通过 Redis 心跳键 `status:ts` / `status-watch:ts` 互相监控（键名是历史遗留，改动必须两边同步）。

架构与流程细节优先读 `doc/project_overview.md`，读不到再翻代码。

## 常用命令

```bash
./dev.sh          # 开发热重载（watchexec：oxfmt → oxlint → 运行）
bun test          # 单元测试（test/*.test.js，不连外部服务）
./deploy.sh       # 部署到 .env 的 DEPLOY_VPS（/opt/monitor + systemctl restart monitor）
./log.sh          # 看服务器日志
```

## 硬性约束

- **必须用 Bun，不能用 node**（fetch 需要 proxy 参数；DB 用内置 `Bun.sql`）
- 入口必须先 `import "@3-/default"`（`Map.prototype.default` 原型扩展，`ERR.default(...)` 等依赖它）；单独写脚本调用 `src/db/*` 时也要先加载
- `./dev.sh` 连的是本地 docker PG `status-pg` + 真实 Redis，**会真实推送告警**；调试时用环境变量覆盖 `LARK` 指向本地 mock

## 配置约定

- `.env` 是唯一秘密来源（不入仓，权限 600），模板 `.env.example`；值一律**单引号包裹**（该文件同时被 bun 和 bash source 解析）
- `conf/`（watch.yml + ip.json）**不入仓**（仓库公开，含真实 IP 与监控拓扑），deploy.sh 会和 `.env` 一起 scp 到服务器；watch.yml 密码写 `${VAR}` 占位符，`src/loadYml.js` 解析后从环境变量递归注入；新增监控时 `.env` 和 `.env.example` 要同步补键
- 配置装配在 `src/loadEnv.js`（纯函数）+ `src/env.js`（fail-fast 校验），代码里不要散落 `process.env`

## DB 层约定（src/DB.js，PostgreSQL）

- `DB.q(sql, ...arg)`：`$n` 占位符，返回**数组行**
- **bigint 列返回字符串**（如 `"1"`），全链路 id 只做 Map 键/模板内插/数值减法——不要引入数字严格比较
- `IN` 列表不能用 `ANY($1)` 传 JS 数组（Bun.sql 不支持），要动态生成 `($1,$2,...)`
- upsert 用 `ON CONFLICT ... DO UPDATE ... RETURNING id`；唯一键冲突判断用 `DB.isDup(err)`（`errno == "23505"`）
- Neon 需要 SNI，`DB.js` 对 `*.neon.tech` 有专门的 URL 分支（`options=endpoint%3D...`），改连接逻辑时别弄丢
- 表结构以 `backup/schema.sql` 为准；DDL/SQL 标识符一律不加引号（PG 折叠小写）

## 修改代码后

- 补/更新 `bun test` 单测（现有风格见 `test/*.test.js`）
- 跑 `oxfmt` + `oxlint`（在 `node_modules/.bin`）
- 阶段性工作完成后更新 `doc/project_overview.md`
