# 状态监控

初始化：`cp .env.example .env` 并填写真实配置；建库用 `./backup/schema.sql`（PostgreSQL 表结构）

# 添加新监控

改 `conf/watch.yml`（声明）→ `src/SRV.js`（参数翻译）→ `src/ping/<srv>.js`（探测实现），详细步骤、push 契约和完整示例见 [doc/add-monitor.md](doc/add-monitor.md)。
