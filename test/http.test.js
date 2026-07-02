import { test, expect } from "bun:test";
import { httpCheck } from "../src/ping/http.js";

test("2xx 且不超时 → 无错误", () => {
  expect(httpCheck(200, "", 100, 1e4)).toEqual([]);
  expect(httpCheck(204, "", 9999, 1e4)).toEqual([]);
  expect(httpCheck(299, "", 1e4, 1e4)).toEqual([]); // 耗时等于阈值不告警
});

test("非 2xx → 带状态码与 body", () => {
  expect(httpCheck(500, '{"error":"boom"}', 100, 1e4)).toEqual(['HTTP 500 {"error":"boom"}']);
  expect(httpCheck(301, "", 100, 1e4)).toEqual(["HTTP 301"]);
  expect(httpCheck(199, "", 100, 1e4)).toEqual(["HTTP 199"]);
});

test("HTML body 丢弃（CF 错误页含随机 Ray ID，避免绕过文本去重）", () => {
  expect(httpCheck(520, "\n<!DOCTYPE html><html>Ray ID: abc123</html>", 100, 1e4)).toEqual([
    "HTTP 520",
  ]);
});

test("非 HTML body 截断到 200 字符", () => {
  const body = "x".repeat(300);
  expect(httpCheck(502, body, 100, 1e4)).toEqual(["HTTP 502 " + "x".repeat(200)]);
});

test("耗时超阈值 → 文本只含阈值不含实测值（保证连续慢只告警一次）", () => {
  expect(httpCheck(200, "", 10001, 1e4)).toEqual(["响应耗时 > 10000ms"]);
  expect(httpCheck(200, "", 99999, 1e4)).toEqual(["响应耗时 > 10000ms"]);
});

test("状态码与耗时同时异常 → 两条", () => {
  expect(httpCheck(500, "err", 20000, 1e4)).toEqual(["HTTP 500 err", "响应耗时 > 10000ms"]);
});
