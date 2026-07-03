import { test, expect } from "bun:test";
import uptimeBuild from "../src/uptimeBuild.js";

// 东八区日界：T0 满足 (T0 + 8*3600) % 86400 == 0，即某天的 00:00（UTC+8）
const T0 = 86400 * 20000 - 8 * 3600;
const NOW = T0 + 3600; // 当天 01:00
const NAMES = new Map([["1", "srv1"]]);
const OLD = new Map([["1", T0 - 100 * 86400]]); // 上线远早于窗口

const run = (over) =>
  uptimeBuild({ fixed: [], ongoing: [], ctime: OLD, names: NAMES, now: NOW, days: 90, ...over });

test("无异常：全 0 秒、100", () => {
  const [[name, pct, days]] = run({});
  expect(name).toBe("srv1");
  expect(pct).toBe("100");
  expect(days).toEqual(Array.from({ length: 90 }, () => 0));
});

test("已恢复故障 30 分钟：当日 1800 秒", () => {
  const [[, pct, days]] = run({ fixed: [["1", T0 - 86400 + 600, 1800]] });
  expect(days[88]).toBe(1800);
  expect(days.slice(0, 88)).toEqual(Array.from({ length: 88 }, () => 0));
  expect(+pct).toBeLessThan(100);
});

test("故障跨日界：按日界拆分秒数", () => {
  // 昨天 23:00 起持续 2 小时 → 昨天 3600s + 今天 3600s
  const [[, , days]] = run({ fixed: [["1", T0 - 3600, 7200]] });
  expect(days[88]).toBe(3600);
  expect(days[89]).toBe(3600);
});

test("进行中的故障计入今天", () => {
  const [[, , days]] = run({ ongoing: [["1", NOW - 300]] });
  expect(days[89]).toBe(300);
});

test("上线晚于窗口：之前的日子为 null，可用率按观测窗口", () => {
  const since = T0 - 2 * 86400; // 3 天前 00:00 上线
  const [[, pct, days]] = run({
    ctime: new Map([["1", since]]),
    fixed: [["1", T0 - 86400, 3600]], // 昨天故障 1 小时
  });
  expect(days.slice(0, 87)).toEqual(Array.from({ length: 87 }, () => null));
  expect(days.slice(87)).toEqual([0, 3600, 0]);
  // 观测窗口 = 2 天 + 1 小时，故障 3600s
  const observed = NOW - since;
  expect(pct).toBe((100 * (1 - 3600 / observed)).toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
});

test("全天持续故障：满 86400 秒", () => {
  const [[, , days]] = run({ fixed: [["1", T0 - 86400, 86400]] });
  expect(days[88]).toBe(86400);
});

test("bigint 字符串入参可正常运算", () => {
  const [[, , days]] = run({ fixed: [[String(1), String(T0 + 60), String(1800)]] });
  expect(days[89]).toBe(1800);
});
