import { test, expect, mock, beforeEach } from "bun:test";

// 隔离探测与后续步骤：ping 结果按 srv 查表，其余步骤只记录调用，失败由 *_err 注入
const calls = [];
let result, notify_err, snapshot_err;

mock.module("../src/ping.js", () => ({
  default: async (now, srv) => {
    calls.push(["ping", srv]);
    return result[srv]();
  },
}));
mock.module("../src/notify.js", () => ({
  default: async (now, events) => {
    calls.push(["notify", now, events]);
    if (notify_err) throw notify_err;
  },
}));
mock.module("../src/stateSnapshot.js", () => ({
  default: async (task, now) => {
    calls.push(["snapshot", task, now]);
    if (snapshot_err) throw snapshot_err;
  },
}));
mock.module("../src/statusWatch.js", () => ({
  default: async (now) => {
    calls.push(["statusWatch", now]);
  },
}));

// ping / notify / statusWatch 各自的单测带 query 导入真实实现，这里的 mock 不会影响它们
const Watch = (await import("../src/Watch.js?real")).default;

const EV = { name: "a/t:v", err: "boom" };
const TASK = new Map([
  ["a", [[1, "t", "v"]]],
  ["b", [[2, "t", "v"]]],
  ["c", [[3, "t", "v"]]],
]);

beforeEach(() => {
  calls.length = 0;
  notify_err = snapshot_err = undefined;
  result = { a: async () => EV, b: async () => undefined, c: async () => undefined };
});

const stepsAfterPing = () => calls.filter((i) => i[0] != "ping");

// 断言探测之后三步都执行，且用的是同一个秒级 now
const expectAllSteps = (events) => {
  const [[, now, ev], [, task, now2], [, now3]] = stepsAfterPing();
  expect(stepsAfterPing().map((i) => i[0])).toEqual(["notify", "snapshot", "statusWatch"]);
  expect(ev).toEqual(events);
  expect(task).toBe(TASK);
  expect(Number.isInteger(now)).toBe(true);
  expect(Math.abs(now - Date.now() / 1e3)).toBeLessThan(5);
  expect([now2, now3]).toEqual([now, now]);
};

test("全部成功：只把有事件的结果交给 notify，不抛错", async () => {
  expect(await Watch(TASK)).toBeUndefined();
  expect(calls.filter((i) => i[0] == "ping")).toHaveLength(3);
  expectAllSteps([EV]);
});

test("单个探测 reject：其余事件照常通知，快照与心跳照常，最后抛出 reject 原因", async () => {
  result.b = async () => {
    throw new Error("errIng 落库失败");
  };
  const err = await Watch(TASK).catch((e) => e);
  expectAllSteps([EV]);
  expect(err).toBeInstanceOf(Error);
  expect(err.message).toContain("errIng 落库失败");
});

test("notify 抛错：快照与心跳照常，最后抛出通知错误", async () => {
  notify_err = new Error("通知发送失败：lark 500");
  const err = await Watch(TASK).catch((e) => e);
  expectAllSteps([EV]);
  expect(err.message).toContain("通知发送失败：lark 500");
});

test("探测与通知同时失败：错误信息包含两者", async () => {
  result.c = async () => {
    throw new Error("recover 落库失败");
  };
  notify_err = new Error("通知发送失败：lark 500");
  const err = await Watch(TASK).catch((e) => e);
  expect(err.message).toBe("recover 落库失败 | 通知发送失败：lark 500");
});

test("多个探测报同一条错误：去重后只出现一次，且不叠加 Error: 前缀", async () => {
  result.b = result.c = async () => {
    throw new Error("db down");
  };
  const err = await Watch(TASK).catch((e) => e);
  expect(err.message).toBe("db down");
});

test("快照失败只记日志：心跳照常，不抛错", async () => {
  snapshot_err = new Error("redis down");
  expect(await Watch(TASK)).toBeUndefined();
  expectAllSteps([EV]);
});
