import { test, expect, afterAll } from "bun:test";
import { join } from "node:path";
import Piscina from "piscina";

// 用真实线程跑 src/var/worker.js，探测换成 test/fixture/probe.js（不 mock 系统模块，避免污染其他测试文件）
const pool = new Piscina({
    filename: join(import.meta.dirname, "../src/var/worker.js"),
    minThreads: 1,
    maxThreads: 1,
  }),
  SRV = "../../test/fixture/probe",
  posted = [];
pool.on("message", (m) => posted.push(m));
// Bun 下 await destroy 会挂起（实测超时 5s），故不等待；线程已 unref，不阻止测试进程退出
afterAll(() => {
  pool.destroy();
});

// 任务结束后上报消息可能晚于结果到达，等一下再断言
const settle = () => new Promise((r) => setTimeout(r, 50));

// 恰好一条上报：[本线程 threadId, 正的堆字节数]
const expectOneReport = () => {
  expect(posted).toEqual([[pool.threads[0].threadId, expect.any(Number)]]);
  expect(posted[0][1]).toBeGreaterThan(0);
};

test("成功：返回探测结果，任务结束后上报一次 [threadId, 堆大小]", async () => {
  posted.length = 0;
  expect(await pool.run([SRV, ["ok", 0]])).toEqual([[], "ok"]);
  await settle();
  expectOneReport();
});

test("探测未结束时不上报（上报在探测完成之后）", async () => {
  posted.length = 0;
  const task = pool.run([SRV, ["ok", 500]]);
  await new Promise((r) => setTimeout(r, 100));
  expect(posted).toHaveLength(0);
  await task;
  await settle();
  expectOneReport();
});

test("失败：原样抛出探测错误，同样上报一次", async () => {
  posted.length = 0;
  await expect(pool.run([SRV, ["fail", 0]])).rejects.toThrow("boom");
  await settle();
  expectOneReport();
});
