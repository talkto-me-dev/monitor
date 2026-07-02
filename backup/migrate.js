#!/usr/bin/env bun
// 一次性数据迁移：TiDB(status 库) → PostgreSQL，可重复执行（冲突跳过）
//
// 用法（在项目根目录，PG 连接从 .env 读取）：
//   MYSQL_URL='mysql://user:pass@host:4000/status' bun backup/migrate.js
// TiDB Cloud 需要 TLS 时加：
//   MYSQL_SSL='{"rejectUnauthorized":true}'

import { SQL } from "bun";
import { DB } from "../src/env.js";

const MYSQL_URL = process.env.MYSQL_URL;
if (!MYSQL_URL) throw new Error("请设置 MYSQL_URL，格式 mysql://user:pass@host:4000/status");

const my = new SQL(MYSQL_URL, {
  tls: process.env.MYSQL_SSL ? JSON.parse(process.env.MYSQL_SSL) : undefined,
});
const pg = new SQL({ adapter: "postgres", ...DB });

// 迁移必须先于应用首次写入：若目标库已有数据，新分配的 id 会与 TiDB 侧的 *_id 引用错位
const [[existed]] = await pg
  .unsafe(
    "SELECT (SELECT count(*) FROM vps) + (SELECT count(*) FROM errIng) + (SELECT count(*) FROM errFixed)",
  )
  .values();
if (existed != 0 && !process.argv.includes("--force")) {
  throw new Error("目标 PG 已有数据（应用可能已先启动写入），确认 id 不会错位后加 --force 重跑");
}

// mysql 侧 begin 是关键字，需反引号；pg 侧不用
const TABLES = [
  ["vps", "id,hostname,ip"],
  ["srv", "id,val"],
  ["txt", "id,hash,val"],
  ["errIng", "id,vps_id,srv_id,txt_id,ts"],
  [
    "errFixed",
    "id,srv_id,vps_id,txt_id,`begin`,duration",
    "id,srv_id,vps_id,txt_id,begin,duration",
  ],
];

// errFixed 的 id 非自增，无序列
const SEQ_TABLES = ["vps", "srv", "txt", "errIng"];

const BATCH = 200;

for (const [table, my_cols, pg_cols = my_cols] of TABLES) {
  const rows = await my.unsafe(`SELECT ${my_cols} FROM ${table}`).values(),
    width = pg_cols.split(",").length;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH),
      marks = chunk.map((_, r) => "(" + chunk[r].map((_, c) => "$" + (r * width + c + 1)) + ")");
    await pg
      .unsafe(
        `INSERT INTO ${table}(${pg_cols}) VALUES ${marks} ON CONFLICT DO NOTHING`,
        chunk.flat(),
      )
      .values();
  }
  console.log(table, rows.length, "行");
}

// 自增序列跳过已迁移的 id
// errIng 的历史 id 都随 recover 搬进了 errFixed（errIng 本身常为空），序列必须同时越过两张表的最大值
const SEQ_MAX = {
  errIng:
    "GREATEST((SELECT COALESCE(MAX(id),0) FROM errIng),(SELECT COALESCE(MAX(id),0) FROM errFixed))",
};
for (const table of SEQ_TABLES) {
  const max = SEQ_MAX[table] || `(SELECT COALESCE(MAX(id),0) FROM ${table})`;
  await pg
    .unsafe(`SELECT setval(pg_get_serial_sequence('${table}','id'), ${max} + 1, false)`)
    .values();
}

await my.end();
await pg.end();
console.log("迁移完成");
