import { test, expect, afterAll } from "bun:test";
import { join } from "node:path";
import Piscina from "piscina";

// 用真实线程跑 src/var/worker.js，探测换成 test/fixture/probe.js（不 mock 系统模块，避免污染其他测试文件）。
// 每个线程 10 分钟内只在首个任务后 GC 并上报一次，所以每个用例用新线程池。
// “超过 10 分钟再次 GC 上报”未覆盖：工作线程的时钟无法从测试控制（mock 系统模块会污染其他测试文件）
const SRV = "../../test/fixture/probe",
  pools = [];
const newPool = () => {
  const pool = new Piscina({
      filename: join(import.meta.dirname, "../src/var/worker.js"),
      minThreads: 1,
      maxThreads: 1,
    }),
    posted = [];
  pool.on("message", (m) => posted.push(m));
  pools.push(pool);
  return { pool, posted };
};
// Bun 下 await destroy 会挂起（实测超时 5s），故不等待；线程已 unref，不阻止测试进程退出
afterAll(() => {
  pools.forEach((pool) => pool.destroy());
});

// 任务结束后上报消息可能晚于结果到达，等一下再断言
const settle = () => new Promise((r) => setTimeout(r, 50));

// 恰好一条上报：[本线程 threadId, 正的堆字节数]
const expectOneReport = ({ pool, posted }) => {
  expect(posted).toEqual([[pool.threads[0].threadId, expect.any(Number)]]);
  expect(posted[0][1]).toBeGreaterThan(0);
};

test("首个任务：返回探测结果，探测完成后才 GC 并上报一次", async () => {
  const p = newPool(),
    task = p.pool.run([SRV, ["ok", 500]]);
  await new Promise((r) => setTimeout(r, 100));
  expect(p.posted).toHaveLength(0);
  expect(await task).toEqual([[], "ok"]);
  await settle();
  expectOneReport(p);
});

test("10 分钟内的后续任务（含失败）不再上报", async () => {
  const p = newPool();
  await p.pool.run([SRV, ["ok", 0]]);
  await p.pool.run([SRV, ["ok", 0]]);
  await p.pool.run([SRV, ["fail", 0]]).catch(() => {});
  await settle();
  expectOneReport(p);
});

test("失败：原样抛出探测错误，首个任务同样 GC 并上报", async () => {
  const p = newPool();
  await expect(p.pool.run([SRV, ["fail", 0]])).rejects.toThrow("boom");
  await settle();
  expectOneReport(p);
});
