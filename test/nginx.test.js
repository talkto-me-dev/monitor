import { test, expect } from "bun:test";
import { nginxCheck } from "../src/ping/nginx.js";

const snap = (t, st, start = 1751500000) => ({ t, start, st });

test("首轮无基线 → 只存快照", () => {
  const cur = snap(60e3, { total: 10, 502: 3 });
  expect(nginxCheck(cur, undefined, 3)).toEqual([[], cur]);
});

test("nginx 重启（start 变化）→ 只存快照", () => {
  const prev = snap(0, { total: 100, 502: 9 }, 1751500000);
  const cur = snap(60e3, { total: 5, 502: 5 }, 1751509999);
  expect(nginxCheck(cur, prev, 3)).toEqual([[], cur]);
});

test("start 未变但计数回退 → 当重置处理", () => {
  const prev = snap(0, { total: 100 });
  const cur = snap(60e3, { total: 50 });
  expect(nginxCheck(cur, prev, 3)).toEqual([[], cur]);
});

test("5xx 增量低于阈值 → 无告警", () => {
  const prev = snap(0, { total: 100, 502: 1 });
  const cur = snap(60e3, { total: 200, 502: 3 });
  expect(nginxCheck(cur, prev, 3)).toEqual([[], cur]);
});

test("达到阈值 → 告警，文本只含阈值（连续超标文本一致）", () => {
  const prev = snap(0, { total: 100, 500: 1, 502: 0 });
  const cur = snap(60e3, { total: 200, 500: 2, 502: 2 });
  expect(nginxCheck(cur, prev, 3)).toEqual([["5xx ≥ 3/分钟"], cur]);
  // 增量更大文本不变
  const cur2 = snap(120e3, { total: 900, 500: 88, 502: 2 });
  expect(nginxCheck(cur2, cur, 3)).toEqual([["5xx ≥ 3/分钟"], cur2]);
});

test("4xx / total 不计入 5xx 阈值", () => {
  const prev = snap(0, { total: 0, 404: 0, 499: 0 });
  const cur = snap(60e3, { total: 999, 404: 500, 499: 100 });
  expect(nginxCheck(cur, prev, 1)).toEqual([[], cur]);
});

test("上一轮没有的状态码键 → 视为 0", () => {
  const prev = snap(0, { total: 10 });
  const cur = snap(60e3, { total: 20, 504: 4 });
  expect(nginxCheck(cur, prev, 3)).toEqual([["5xx ≥ 3/分钟"], cur]);
});

test("间隔拉长按每分钟折算（上一轮失败不累计误报）", () => {
  const prev = snap(0, { 502: 0 });
  // 3 分钟增 6 个 → 2/分钟 < 3 不告警
  expect(nginxCheck(snap(180e3, { 502: 6 }), prev, 3)).toEqual([[], snap(180e3, { 502: 6 })]);
  // 3 分钟增 9 个 → 3/分钟 ≥ 3 告警
  expect(nginxCheck(snap(180e3, { 502: 9 }), prev, 3)).toEqual([
    ["5xx ≥ 3/分钟"],
    snap(180e3, { 502: 9 }),
  ]);
});

test("服务无流量（端点里没有该服务的键，st undefined）→ 不判断不报错", () => {
  const prev = snap(0, undefined);
  const cur = snap(60e3, undefined);
  expect(nginxCheck(cur, prev, 3)).toEqual([[], cur]);
  // 从无流量到有流量：st 从 undefined 变为对象，所有码视为从 0 增长
  const cur2 = snap(120e3, { total: 9, 502: 5 });
  expect(nginxCheck(cur2, cur, 3)).toEqual([["5xx ≥ 3/分钟"], cur2]);
});
