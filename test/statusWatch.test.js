import { test, expect, mock, beforeEach } from "bun:test";

// 隔离 Redis 与发送通道：exec 返回 pipeline 每条命令的 [err, val]，sent 记录发出的消息
const sent = [];
let exec;

mock.module("../src/R.js", () => ({
  default: {
    pipeline: () => ({ get() {}, setex() {}, exec: async () => exec() }),
  },
}));
mock.module("../src/send.js", () => ({
  default: async (title, body) => {
    sent.push([title, body]);
  },
}));

// statusWatch 有模块级失联状态：每个用例带不同 query 导入一份全新实例，用例互不影响
let n = 0;
const load = async () => (await import("../src/statusWatch.js?case" + ++n)).default;

beforeEach(() => {
  sent.length = 0;
});

const NOW = 6000, // 第 100 分钟
  beat = (minute) => () => [
    [null, minute],
    [null, "OK"],
  ],
  REDIS_DOWN = () => [
    [new Error("Command timed out"), null],
    [new Error("Command timed out"), null],
  ];

test("心跳正常：不发送", async () => {
  const statusWatch = await load();
  exec = beat(95);
  await statusWatch(NOW);
  expect(sent).toEqual([]);
});

test("Redis 命令报错：发送失联，正文说明 Redis 不可用", async () => {
  const statusWatch = await load();
  exec = REDIS_DOWN;
  await statusWatch(NOW);
  expect(sent).toHaveLength(1);
  expect(sent[0][0]).toBe("❌ monitor-watch 失联");
  expect(sent[0][1]).toContain("Redis 不可用");
  expect(sent[0][1]).toContain("Command timed out");
  expect(sent[0][1]).not.toContain("没有 monitor-watch 的心跳");
});

test("心跳缺失：发送失联，正文为没有心跳", async () => {
  const statusWatch = await load();
  exec = beat(null);
  await statusWatch(NOW);
  expect(sent).toHaveLength(1);
  expect(sent[0][0]).toBe("❌ monitor-watch 失联");
  expect(sent[0][1]).toStartWith("Redis 中没有 monitor-watch 的心跳");
});

test("心跳超过 10 分钟：发送失联并给出间隔", async () => {
  const statusWatch = await load();
  exec = beat(89);
  await statusWatch(NOW);
  expect(sent[0][1]).toStartWith("最后心跳在 11 分钟前");
});

test("持续失联只发一次，恢复后发已恢复并带失联时长，之后正常不再发", async () => {
  const statusWatch = await load();
  exec = REDIS_DOWN;
  await statusWatch(NOW);
  await statusWatch(NOW + 60);
  expect(sent.map((i) => i[0])).toEqual(["❌ monitor-watch 失联"]);
  exec = beat(101);
  await statusWatch(NOW + 120);
  expect(sent[1]).toEqual(["✅ monitor-watch 已恢复", "失联持续 2 分钟"]);
  await statusWatch(NOW + 180);
  expect(sent).toHaveLength(2);
});
