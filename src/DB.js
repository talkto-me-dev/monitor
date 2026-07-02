#!/usr/bin/env bun

import { SQL } from "bun";
import { DB } from "./env.js";

const sql = DB.host.endsWith("neon.tech")
  ? new SQL({
      url: `postgres://${encodeURIComponent(DB.username)}:${encodeURIComponent(DB.password)}@${DB.host}:${DB.port}/${DB.database}?sslmode=require&options=endpoint%3D${DB.host.split(".")[0]}`,
    })
  : new SQL({ adapter: "postgres", ...DB });

export default {
  sql,
  // 返回数组行；注意 PG 的 bigint 列返回的是字符串
  q: (str, ...arg) => sql.unsafe(str, arg).values(),
  // 唯一键冲突（并发插入兜底用）
  isDup: (err) => err?.errno == "23505",
};
