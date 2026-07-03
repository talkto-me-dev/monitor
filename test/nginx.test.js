import { test, expect } from "bun:test";
import { nginxCheck } from "../src/ping/nginx.js";

const snap = (t, srv, start = 1751500000) => ({ t, start, srv });

test("首轮无基线 → 只存快照", () => {
  const cur = snap(60e3, { api: { total: 10, 502: 3 } });
  expect(nginxCheck(cur, undefined, 3)).toEqual([[], cur]);
});

test("nginx 重启（start 变化）→ 只存快照", () => {
  const prev = snap(0, { api: { total: 100, 502: 9 } }, 1751500000);
  const cur = snap(60e3, { api: { total: 5, 502: 5 } }, 1751509999);
  expect(nginxCheck(cur, prev, 3)).toEqual([[], cur]);
});

test("start 未变但计数回退 → 当重置处理", () => {
  const prev = snap(0, { api: { total: 100 } });
  const cur = snap(60e3, { api: { total: 50 } });
  expect(nginxCheck(cur, prev, 3)).toEqual([[], cur]);
});

test("5xx 增量低于阈值 → 无告警", () => {
  const prev = snap(0, { api: { total: 100, 502: 1 } });
  const cur = snap(60e3, { api: { total: 200, 502: 3 } });
  expect(nginxCheck(cur, prev, 3)).toEqual([[], cur]);
});

test("达到阈值 → 告警，文本只含服务名与阈值（连续超标文本一致）", () => {
  const prev = snap(0, { api: { total: 100, 500: 1, 502: 0 } });
  const cur = snap(60e3, { api: { total: 200, 500: 2, 502: 2 } });
  expect(nginxCheck(cur, prev, 3)).toEqual([["api 5xx ≥ 3/分钟"], cur]);
  // 增量更大文本不变
  const cur2 = snap(120e3, { api: { total: 900, 500: 88, 502: 2 } });
  expect(nginxCheck(cur2, cur, 3)).toEqual([["api 5xx ≥ 3/分钟"], cur2]);
});

test("4xx / total 不计入 5xx 阈值", () => {
  const prev = snap(0, { api: { total: 0, 404: 0, 499: 0 } });
  const cur = snap(60e3, { api: { total: 999, 404: 500, 499: 100 } });
  expect(nginxCheck(cur, prev, 1)).toEqual([[], cur]);
});

test("多服务独立判断，超标的合并为多行", () => {
  const prev = snap(0, { a: { 502: 0 }, b: { 502: 0 }, c: { 502: 0 } });
  const cur = snap(60e3, { a: { 502: 5 }, b: { 502: 1 }, c: { 504: 4 } });
  // c 上一轮没有 504 键 → 视为 0
  expect(nginxCheck(cur, prev, 3)).toEqual([["a 5xx ≥ 3/分钟", "c 5xx ≥ 3/分钟"], cur]);
});

test("prev 有而 cur 缺的服务不判断（快照正常前移）", () => {
  const prev = snap(0, { gone: { 502: 99 }, a: { 502: 0 } });
  const cur = snap(60e3, { a: { 502: 0 } });
  expect(nginxCheck(cur, prev, 3)).toEqual([[], cur]);
});

test("新出现的服务本轮跳过（无基线）", () => {
  const prev = snap(0, { a: { 502: 0 } });
  const cur = snap(60e3, { a: { 502: 0 }, fresh: { 502: 99 } });
  expect(nginxCheck(cur, prev, 3)).toEqual([[], cur]);
});

test("间隔拉长按每分钟折算（上一轮失败不累计误报）", () => {
  const prev = snap(0, { api: { 502: 0 } });
  // 3 分钟增 6 个 → 2/分钟 < 3 不告警
  const cur = snap(180e3, { api: { 502: 6 } });
  expect(nginxCheck(cur, prev, 3)).toEqual([[], cur]);
  // 3 分钟增 9 个 → 3/分钟 ≥ 3 告警
  const cur2 = snap(180e3, { api: { 502: 9 } });
  expect(nginxCheck(cur2, prev, 3)).toEqual([["api 5xx ≥ 3/分钟"], cur2]);
});

test("srv 缺失或为空 → 不判断", () => {
  const prev = snap(0, {});
  expect(nginxCheck(snap(60e3, {}), prev, 3)).toEqual([[], snap(60e3, {})]);
  expect(nginxCheck({ t: 60e3, start: 1751500000 }, prev, 3)).toEqual([
    [],
    { t: 60e3, start: 1751500000 },
  ]);
});
