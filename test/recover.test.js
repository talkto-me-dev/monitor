import { test, expect, mock, beforeEach } from "bun:test";

// 隔离 DB：sql 按顺序记录，fail_on 命中的 SQL 抛错；OK_SINCE 换成空 Map 避免启动查库
const sql = [],
  OK_SINCE = new Map();
let fail_on;

mock.module("../src/DB.js", () => ({
  default: {
    q: async (str) => {
      if (fail_on && str.startsWith(fail_on)) throw new Error(fail_on + " 失败");
      sql.push(str.split(" ")[0]);
      return [];
    },
  },
}));
mock.module("../src/db/OK_SINCE.js", () => ({ default: OK_SINCE }));

// ping.test 会 mock recover.js，这里取真实实现
const recover = (await import("../src/db/recover.js?real")).default;

beforeEach(() => {
  sql.length = 0;
  OK_SINCE.clear();
  fail_on = undefined;
});

// 启动时从库加载的 begin 是 bigint 字符串
const PRE = ["boom", "100", 5, 7];

test("先写 errFixed 再删 errIng，最后更新 OK_SINCE 并返回事件", async () => {
  expect(await recover(160, "smtp/x:v", 1, 2, PRE)).toEqual({
    name: "smtp/x:v",
    begin: 100,
    err: "boom",
    ok: true,
  });
  expect(sql).toEqual(["INSERT", "DELETE"]);
  expect(OK_SINCE.get("1:2")).toBe(160);
});

test("写 errFixed 失败：不删 errIng，不改 OK_SINCE", async () => {
  fail_on = "INSERT";
  await expect(recover(160, "n", 1, 2, PRE)).rejects.toThrow("INSERT 失败");
  expect(sql).toEqual([]);
  expect(OK_SINCE.has("1:2")).toBe(false);
});

test("删 errIng 失败：抛错且不改 OK_SINCE（下一轮重试，errFixed 有 ON CONFLICT 兜底）", async () => {
  fail_on = "DELETE";
  await expect(recover(160, "n", 1, 2, PRE)).rejects.toThrow("DELETE 失败");
  expect(sql).toEqual(["INSERT"]);
  expect(OK_SINCE.has("1:2")).toBe(false);
});
