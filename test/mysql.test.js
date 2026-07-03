import { test, expect } from "bun:test";
import { mysqlErr } from "../src/ping/mysql.js";

test("有错误码 → 码 + message 首行", () => {
  expect(mysqlErr("ER_ACCESS_DENIED_ERROR", "Access denied for user 'x'@'%'")).toBe(
    "ER_ACCESS_DENIED_ERROR Access denied for user 'x'@'%'",
  );
});

test("message 只取首行并去掉首尾空白（多行堆栈不进告警）", () => {
  expect(mysqlErr(undefined, "  connect ECONNREFUSED\n    at foo.js:1:1")).toBe(
    "connect ECONNREFUSED",
  );
});

test("只有错误码 / 都缺失", () => {
  expect(mysqlErr("ECONNREFUSED", "")).toBe("ECONNREFUSED");
  expect(mysqlErr(undefined, undefined)).toBe("连接失败");
});

test("message 截断到 200 字符", () => {
  expect(mysqlErr(undefined, "x".repeat(300))).toBe("x".repeat(200));
});

test("错误码 + 多行 message 组合", () => {
  expect(mysqlErr("ETIMEDOUT", "connect ETIMEDOUT 1.2.3.4:4000\n    at connect")).toBe(
    "ETIMEDOUT connect ETIMEDOUT 1.2.3.4:4000",
  );
});
