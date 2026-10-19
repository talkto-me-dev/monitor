import { test, expect } from "bun:test";
import { join } from "node:path";
import redisSentinel from "../src/ping/redis_sentinel.js";

// 127.0.0.1:1 必定拒绝连接（毫秒级），不依赖任何外部服务
const CONF = { port: 1, password: "p", cluster: ["c1"], vps: ["127.0.0.1"] },
  IP_NAME = new Map([["127.0.0.1", "local"]]);

test("连不上哨兵：抛出真实的连接错误而非 Connection is closed.", async () => {
  const err = await redisSentinel(structuredClone(CONF), IP_NAME).catch((e) => e);
  expect(err).toBeInstanceOf(Error);
  expect(String(err)).toContain("ECONNREFUSED");
  expect(String(err)).not.toContain("Connection is closed");
});

test("连接失败返回后不残留连接：子进程能自然退出", async () => {
  // 残留的 socket / 重连定时器会让进程挂住；子进程不调用 process.exit，超时即判失败
  const script = `
    import f from ${JSON.stringify(join(import.meta.dir, "../src/ping/redis_sentinel.js"))};
    try {
      await f(${JSON.stringify(CONF)}, new Map());
    } catch (e) {
      console.log(e.code ?? String(e));
    }
  `;
  const proc = Bun.spawn([process.execPath, "-e", script], { stdout: "pipe", stderr: "pipe" }),
    timer = setTimeout(() => proc.kill(), 1e3),
    code = await proc.exited;
  clearTimeout(timer);
  expect(proc.signalCode).toBeNull();
  expect(code).toBe(0);
  expect(await new Response(proc.stdout).text()).toContain("ECONNREFUSED");
}, 10e3);
