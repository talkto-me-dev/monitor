import { test, expect } from "bun:test";
import { sslCheck } from "../src/ping/ssl.js";

const DAY = 864e5;
const NOW = Date.parse("2026-07-03T00:00:00Z");
const validTo = (days) => new Date(NOW + days * DAY).toUTCString();

test("剩余天数充足 → 无错误", () => {
  expect(sslCheck(validTo(90), 14, NOW)).toEqual([]);
  expect(sslCheck(validTo(14), 14, NOW)).toEqual([]); // 恰好等于阈值不告警
});

test("剩余天数不足 → 告警", () => {
  expect(sslCheck(validTo(13.5), 14, NOW)).toEqual([
    "SSL 证书剩余 13 天（" + validTo(13.5) + " 过期）",
  ]);
  expect(sslCheck(validTo(0.5), 14, NOW)[0]).toStartWith("SSL 证书剩余 0 天");
});

test("已过期 → 负数天也告警", () => {
  expect(sslCheck(validTo(-2), 14, NOW)[0]).toStartWith("SSL 证书剩余 -2 天");
});

test("openssl 的 valid_to 格式可解析", () => {
  // node:tls getPeerCertificate 返回的实际格式
  expect(sslCheck("Sep  9 07:01:10 2026 GMT", 14, NOW)).toEqual([]);
  expect(sslCheck("Jul  5 00:00:00 2026 GMT", 14, NOW)[0]).toStartWith("SSL 证书剩余 2 天");
});

test("无法解析的过期时间 → 告警而非静默", () => {
  expect(sslCheck("not-a-date", 14, NOW)).toEqual(["SSL 证书过期时间无法解析: not-a-date"]);
  expect(sslCheck(undefined, 14, NOW)).toEqual(["SSL 证书过期时间无法解析: undefined"]);
});
