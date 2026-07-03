#!/usr/bin/env bun
// 一次性迁移（2026-07）：mysql 顶层键由"每实例一键"（mysql/tidb-prod-intl、mysql/tidb-alpha-intl）
// 合并为"集群一键"（mysql/tidb）。errFixed/errIng 历史挪到新 srv_id，
// 新键 ctime 回填旧键最早值（保住 90 天可用率观测窗口起点）。
// 旧 srv 行保留（含已不在监控清单里的遗留记录，便于审计）。幂等，可重复执行。
// 用法：在 monitor 目录下 bun backup/migrateMysqlTidb.js（bun 自动加载 .env）

import DB from "../src/DB.js";

const OLD = ["mysql/tidb-prod-intl", "mysql/tidb-alpha-intl"],
  NEW = "mysql/tidb";

// Bun.sql 的 unsafe 不把 JS 数组序列化成 PG 数组，一律用 IN 占位符展开
const holders = (li, from = 1) => li.map((_, i) => "$" + (i + from)).join(",");

await DB.sql.begin(async (tx) => {
  const q = (str, ...arg) => tx.unsafe(str, arg).values();

  const old_rows = await q("SELECT id,ctime FROM srv WHERE val IN (" + holders(OLD) + ")", ...OLD);
  if (!old_rows.length) {
    console.log("旧键不存在，无需迁移");
    return;
  }
  const old_ids = old_rows.map((r) => r[0]),
    min_ctime = Math.min(...old_rows.map((r) => +r[1]));

  await q("INSERT INTO srv(val) VALUES ($1) ON CONFLICT (val) DO NOTHING", NEW);
  const [[new_id]] = await q(
    "UPDATE srv SET ctime = LEAST(ctime,$2) WHERE val=$1 RETURNING id",
    NEW,
    min_ctime,
  );

  const fixed = await q(
    "UPDATE errFixed SET srv_id=$1 WHERE srv_id IN (" + holders(old_ids, 2) + ") RETURNING id",
    new_id,
    ...old_ids,
  );
  const ing = await q(
    "UPDATE errIng SET srv_id=$1 WHERE srv_id IN (" + holders(old_ids, 2) + ") RETURNING id",
    new_id,
    ...old_ids,
  );
  console.log(
    `srv "${NEW}" id=${new_id} ctime←${min_ctime}；errFixed 迁移 ${fixed.length} 条，errIng 迁移 ${ing.length} 条`,
  );
});

process.exit();
