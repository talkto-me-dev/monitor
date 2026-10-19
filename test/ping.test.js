import { test, expect, mock, beforeEach, afterAll } from "bun:test";

// 隔离 DB / 线程池：probe 决定每次探测结果，errIngNew / recover 只记录调用，落库失败由 *_fail 注入
let probe, err_fail, ok_fail;
const calls = [];
const ERR = new Map();

mock.module("../src/var/THREAD_POOL.js", () => ({ default: { run: (...a) => probe(...a) } }));
mock.module("../src/db/VPS_ID_IP.js", () => ({ default: new Map([["v", ["9"]]]) }));
mock.module("../src/db/ERR.js", () => ({ default: ERR }));
mock.module("../src/db/errIngNew.js", () => ({
  default: async (now, begin, errmap, err, name, srv_id, vps_id) => {
    calls.push(["err", now, begin, err]);
    if (err_fail) throw new Error("errIng 落库失败");
    errmap.set(vps_id, [err, begin]);
    return { name, err };
  },
}));
mock.module("../src/db/recover.js", () => ({
  default: async (now, name, _srv_id, _vps_id, [err, begin]) => {
    calls.push(["ok", now, begin, err]);
    if (ok_fail) throw new Error("recover 落库失败");
    return { name, begin, err, ok: true };
  },
}));

// 5s 重试等待直接放行，避免单测变慢
const _setTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => _setTimeout(fn, ms == 5e3 ? 0 : ms, ...a);
afterAll(() => {
  globalThis.setTimeout = _setTimeout;
});

await import("@3-/default");
// Watch.test.js 会 mock 同路径模块（bun 的 mock.module 跨文件生效），带 query 拿到真实实现
const ping = (await import("../src/ping.js?real")).default;

const OK = async () => {};
const FAIL = async () => {
  throw new Error("boom");
};

let srv_id = 0;
beforeEach(() => {
  calls.length = 0;
  err_fail = ok_fail = false;
  ++srv_id; // 每个用例独立的 srv_id，互不共享待确认/异常状态
});
const run = (now) => ping(now, "smtp", "x", srv_id, "v", []);

test("单轮失败后恢复：不告警也不发恢复", async () => {
  probe = FAIL;
  expect(await run(100)).toBeUndefined();
  probe = OK;
  expect(await run(160)).toBeUndefined();
  expect(calls).toEqual([]);
});

test("连续两轮失败才告警，起始时间取首次失败", async () => {
  probe = FAIL;
  expect(await run(100)).toBeUndefined();
  expect(await run(160)).toEqual({ name: "smtp/x:v", err: "boom" });
  expect(calls).toEqual([["err", 160, 100, "boom"]]);
  probe = OK;
  expect(await run(220)).toMatchObject({ ok: true, begin: 100 });
});

test("中途恢复会清掉待确认，之后再失败重新计轮", async () => {
  probe = FAIL;
  await run(100);
  probe = OK;
  await run(160);
  probe = FAIL;
  expect(await run(220)).toBeUndefined();
  expect(await run(280)).toBeDefined();
  expect(calls).toEqual([["err", 280, 220, "boom"]]);
});

test("已在故障中：错误变化立即上报（不再等两轮）", async () => {
  ERR.set(srv_id, new Map([["9", ["old", 50]]]));
  probe = FAIL;
  expect(await run(100)).toEqual({ name: "smtp/x:v", err: "boom" });
  expect(calls.map((c) => c[0])).toEqual(["err"]);
});

test("有状态探测的业务告警立即上报", async () => {
  probe = async () => [["5xx ≥ 3/分钟"], { n: 1 }];
  expect(await run(100)).toEqual({ name: "smtp/x:v", err: "5xx ≥ 3/分钟" });
});

test("有状态探测本身连不上：仍走两轮确认", async () => {
  probe = FAIL;
  expect(await run(100)).toBeUndefined();
  probe = async () => [[], { n: 1 }];
  expect(await run(160)).toBeUndefined();
  expect(calls).toEqual([]);
});

test("首次失败、5s 重试成功：视为正常", async () => {
  let n = 0;
  probe = async () => {
    if (!n++) throw new Error("blip");
  };
  expect(await run(100)).toBeUndefined();
  probe = FAIL;
  expect(await run(160)).toBeUndefined(); // 这是第一轮失败，仍待确认
  expect(calls).toEqual([]);
});

test("已在故障中、错误文本不变：交给 errIngNew 去重（mock 原样记录调用）", async () => {
  ERR.set(srv_id, new Map([["9", ["boom", 50]]]));
  probe = FAIL;
  await run(100);
  // 不进待确认、本轮即交给 errIngNew；begin 由 errIngNew 用 pre_err[1] 覆盖，ping 侧传值无意义
  expect(calls).toEqual([["err", 100, expect.any(Number), "boom"]]);
});

test("recover 落库失败：ping reject，异常状态保留，下一轮成功再次 recover", async () => {
  ERR.set(srv_id, new Map([["9", ["boom", 50]]]));
  probe = OK;
  ok_fail = true;
  await expect(run(100)).rejects.toThrow("recover 落库失败");
  ok_fail = false;
  expect(await run(160)).toMatchObject({ ok: true, begin: 50, err: "boom" });
  expect(calls).toEqual([
    ["ok", 100, 50, "boom"],
    ["ok", 160, 50, "boom"],
  ]);
});

test("errIngNew 落库失败：ping reject，待确认不丢，下一轮仍以首次失败时刻为起始", async () => {
  probe = FAIL;
  expect(await run(100)).toBeUndefined();
  err_fail = true;
  await expect(run(160)).rejects.toThrow("errIng 落库失败");
  err_fail = false;
  expect(await run(220)).toEqual({ name: "smtp/x:v", err: "boom" });
  expect(calls).toEqual([
    ["err", 160, 100, "boom"],
    ["err", 220, 100, "boom"],
  ]);
});

test("上一轮连接失败待确认、本轮出有状态业务告警：立即上报，起始为本轮", async () => {
  probe = FAIL;
  expect(await run(100)).toBeUndefined();
  probe = async () => [["5xx ≥ 3/分钟"], { n: 1 }];
  expect(await run(160)).toEqual({ name: "smtp/x:v", err: "5xx ≥ 3/分钟" });
  expect(calls).toEqual([["err", 160, 160, "5xx ≥ 3/分钟"]]);
});

test("两次都超时：错误文本为 timeout", async () => {
  probe = async () => {
    throw Object.assign(new Error("aborted"), { name: "AbortError" });
  };
  await run(100);
  expect(await run(160)).toEqual({ name: "smtp/x:v", err: "timeout" });
});

test('错误文本只去掉开头的 "Error: "，其他类型保留类型名', async () => {
  probe = async () => {
    throw new TypeError("y");
  };
  await run(100);
  expect(await run(160)).toEqual({ name: "smtp/x:v", err: "TypeError: y" });
});
