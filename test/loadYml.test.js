import { test, expect } from "bun:test";
import { join, dirname } from "node:path";
import ymlLoad from "@3-/yml/load.js";
import { envRef } from "../src/loadYml.js";

test("字符串占位符替换", () => {
  expect(envRef("${A}:${B}", { A: "1", B: "2" })).toBe("1:2");
  expect(envRef("无占位符", {})).toBe("无占位符");
});

test("嵌套对象与数组", () => {
  const obj = { a: "${X}", b: ["${X}", "raw"], c: { d: "${X}" }, n: 7 };
  envRef(obj, { X: "v" });
  expect(obj).toEqual({ a: "v", b: ["v", "raw"], c: { d: "v" }, n: 7 });
});

test("缺失变量报错", () => {
  expect(() => envRef("${MISSING_VAR}", {})).toThrow("MISSING_VAR");
});

test("conf/watch.yml 占位符可全部解析", () => {
  const watch = ymlLoad(join(dirname(import.meta.dirname), "conf", "watch.yml"));
  const fake = { SENTINEL_PASSWORD: "sp", IPV6_PROXY_AUTH: "user:pass", SMTP_PASSWORD: "mp" };
  envRef(watch, fake);

  const [sentinel] = Object.entries(watch).filter(([k]) => k.startsWith("redis_sentinel"));
  expect(sentinel[1].password).toBe("sp");
  expect(watch.ipv6_proxy.auth).toBe("user:pass");
  const [smtp] = Object.entries(watch).filter(([k]) => k.startsWith("smtp"));
  expect(smtp[1].password).toBe("mp");
  // 整棵树不再残留占位符
  expect(JSON.stringify(watch)).not.toContain("${");
});
