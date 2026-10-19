import { test, expect, mock, beforeEach } from "bun:test";

// 隔离 DB：sql 记录每条 SQL，INSERT 返回固定 errIng id；txt_id 固定
const COOLDOWN = 3600,
  ERRING_ID = 11,
  TXT_ID = 7,
  sql = [],
  txt = [];

mock.module("../src/DB.js", () => ({
  default: {
    q: async (str) => {
      sql.push(str);
      return [[ERRING_ID]];
    },
  },
}));
mock.module("../src/db/txtId.js", () => ({
  default: async (t) => {
    txt.push(t);
    return TXT_ID;
  },
}));
mock.module("../src/env.js", () => ({ ALERT_COOLDOWN: COOLDOWN }));

// ping.test.js 会 mock 同路径模块（bun 的 mock.module 跨文件生效），带 query 拿到真实实现
const errIngNew = (await import("../src/db/errIngNew.js?real")).default;

beforeEach(() => {
  sql.length = 0;
  txt.length = 0;
});

const SRV_ID = 3,
  VPS_ID = 4,
  NAME = "smtp/x:v";
const call = (now, begin, errmap, err) => errIngNew(now, begin, errmap, err, NAME, SRV_ID, VPS_ID);
// INSERT 语句里 VALUES 的 ts（第 4 个值）
const insertTs = () => sql[0].match(/VALUES \((\d+),(\d+),(\d+),(\d+)\)/).slice(1);

test("错误文本与上次相同：返回 undefined，不写库也不改内存", async () => {
  const pre = ["boom", 50, 1, 2, 60],
    errmap = new Map([[VPS_ID, pre]]);
  expect(await call(200, 200, errmap, "boom")).toBeUndefined();
  expect(sql).toEqual([]);
  expect(txt).toEqual([]);
  expect(errmap.get(VPS_ID)).toBe(pre);
});

test("新故障：INSERT 的 ts 为传入的 begin，errmap 记录完整状态", async () => {
  const errmap = new Map();
  expect(await call(200, 100, errmap, "boom")).toEqual({ name: NAME, err: "boom", pre: undefined });
  expect(txt).toEqual(["boom"]);
  expect(sql).toHaveLength(1);
  expect(insertTs()).toEqual([String(VPS_ID), String(SRV_ID), String(TXT_ID), "100"]);
  expect(errmap.get(VPS_ID)).toEqual(["boom", 100, ERRING_ID, TXT_ID, 200]);
});

test("错误文本变化：沿用原故障起始时间，并带回上一条错误", async () => {
  const pre = ["old", 50, 1, 2, 60],
    errmap = new Map([[VPS_ID, pre]]);
  expect(await call(200, 200, errmap, "new")).toEqual({ name: NAME, err: "new", pre });
  expect(insertTs()[3]).toBe("50");
  expect(errmap.get(VPS_ID)).toEqual(["new", 50, ERRING_ID, TXT_ID, 200]);
});

test("证书类错误间变化、冷却期内：只更新记录不通知，保留上次通知时间", async () => {
  const errmap = new Map([[VPS_ID, ["证书剩余 10 天", 50, 1, 2, 1000]]]);
  expect(await call(1000 + COOLDOWN - 1, 1000, errmap, "证书剩余 9 天")).toBeUndefined();
  expect(sql).toHaveLength(1);
  expect(errmap.get(VPS_ID)).toEqual(["证书剩余 9 天", 50, ERRING_ID, TXT_ID, 1000]);
});

test("证书类错误间变化、冷却期满（含恰好等于冷却时长）：照常通知并刷新通知时间", async () => {
  const now = 1000 + COOLDOWN,
    pre = ["证书剩余 10 天", 50, 1, 2, 1000],
    errmap = new Map([[VPS_ID, pre]]);
  expect(await call(now, now, errmap, "证书剩余 9 天")).toEqual({
    name: NAME,
    err: "证书剩余 9 天",
    pre,
  });
  expect(errmap.get(VPS_ID)[4]).toBe(now);
});

test("从库加载的记录没有上次通知时间：冷却按故障起始计算", async () => {
  // ERR.js 启动加载时 begin 是 bigint 字符串，且只有 4 位
  const errmap = new Map([[VPS_ID, ["证书剩余 10 天", "1000", 1, 2]]]);
  expect(await call(1000 + COOLDOWN - 1, 0, errmap, "证书剩余 9 天")).toBeUndefined();
  expect(errmap.get(VPS_ID)[4]).toBe("1000");
  expect(await call(1000 + COOLDOWN, 0, errmap, "证书剩余 8 天")).toBeDefined();
  expect(errmap.get(VPS_ID)[4]).toBe(1000 + COOLDOWN);
});

test("证书与非证书错误互相切换：不受冷却限制", async () => {
  const errmap = new Map([[VPS_ID, ["证书剩余 10 天", 50, 1, 2, 1000]]]);
  expect(await call(1001, 1001, errmap, "Connection timeout")).toBeDefined();
  expect(await call(1002, 1002, errmap, "证书剩余 9 天")).toBeDefined();
});
