import { test, expect, mock, beforeEach } from "bun:test";
import { errCard, recoverCard } from "../src/alertText.js";

// 隔离 DB 与发送通道：log 按发生顺序记录查询与发送，失败由 query_err / send_err 注入
const log = [],
  REMAIN = [["smtp/y", "vps-b", 40]];
let query_err, send_err;

mock.module("../src/DB.js", () => ({
  default: {
    q: async (str) => {
      log.push(["q", str]);
      if (query_err) throw query_err;
      return REMAIN;
    },
  },
}));
mock.module("../src/send.js", () => ({
  default: async (title, body) => {
    log.push(["send", title, body]);
    if (send_err?.(title)) throw new Error("发送失败 " + title);
  },
}));

// Watch.test.js 会 mock 同路径模块（跨文件生效），带 query 拿到真实实现
const notify = (await import("../src/notify.js?real")).default;

beforeEach(() => {
  log.length = 0;
  query_err = send_err = undefined;
});

const NOW = 1000,
  ERR_EV = { name: "smtp/x:v", err: "boom", pre: undefined },
  OK_EV = { name: "http/a.com", begin: 100, err: "timeout", ok: true };

test("无事件：不查库也不发送", async () => {
  await notify(NOW, []);
  expect(log).toEqual([]);
});

test("只有故障事件：不查库，发一张故障卡", async () => {
  await notify(NOW, [ERR_EV]);
  expect(log).toEqual([["send", ...errCard([ERR_EV])]]);
  expect(log[0][1]).toBe("❌ smtp/x:v 故障");
});

test("有恢复事件：查询其余进行中异常后发恢复卡", async () => {
  await notify(NOW, [OK_EV]);
  expect(log.map((i) => i[0])).toEqual(["q", "send"]);
  expect(log[0][1]).toContain("FROM errIng");
  expect(log[1].slice(1)).toEqual(recoverCard(NOW, [OK_EV], REMAIN));
  expect(log[1][1]).toBe("✅ http/a.com 已恢复");
  expect(log[1][2]).toContain("其余 1 个异常仍在持续");
});

test("故障与恢复都有：先发故障卡再发恢复卡，各自只含本类事件", async () => {
  await notify(NOW, [OK_EV, ERR_EV]);
  expect(log.filter((i) => i[0] == "send").map((i) => i.slice(1))).toEqual([
    errCard([ERR_EV]),
    recoverCard(NOW, [OK_EV], REMAIN),
  ]);
});

test("故障卡发送失败：恢复卡仍发送，最后抛出包含失败原因的错误", async () => {
  send_err = (title) => title.startsWith("❌");
  const err = await notify(NOW, [ERR_EV, OK_EV]).catch((e) => e);
  expect(log.filter((i) => i[0] == "send").map((i) => i[1])).toEqual([
    "❌ smtp/x:v 故障",
    "✅ http/a.com 已恢复",
  ]);
  expect(err).toBeInstanceOf(Error);
  expect(err.message).toContain("发送失败 ❌ smtp/x:v 故障");
});

test("两张卡都失败：错误信息同时包含两者", async () => {
  send_err = () => true;
  const err = await notify(NOW, [ERR_EV, OK_EV]).catch((e) => e);
  expect(err.message).toContain("发送失败 ❌ smtp/x:v 故障");
  expect(err.message).toContain("发送失败 ✅ http/a.com 已恢复");
});

test("查询其余异常失败：恢复卡不发，故障卡照发，错误被抛出", async () => {
  query_err = new Error("db down");
  const err = await notify(NOW, [ERR_EV, OK_EV]).catch((e) => e);
  expect(log.filter((i) => i[0] == "send").map((i) => i[1])).toEqual(["❌ smtp/x:v 故障"]);
  expect(err.message).toContain("db down");
});
