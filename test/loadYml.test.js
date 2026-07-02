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
  // conf/ 不入仓且监控项会增减，测试不假设具体条目：动态提取占位符名构造假环境
  const watch = ymlLoad(join(dirname(import.meta.dirname), "conf", "watch.yml"));
  const raw = JSON.stringify(watch),
    fake = Object.fromEntries([...raw.matchAll(/\$\{(\w+)\}/g)].map(([, k]) => [k, "v_" + k]));
  envRef(watch, fake);

  expect(Object.keys(watch).length).toBeGreaterThan(0);
  // 整棵树不再残留占位符
  expect(JSON.stringify(watch)).not.toContain("${");
});
