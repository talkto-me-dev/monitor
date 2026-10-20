import { test, expect, spyOn } from "bun:test";
import { EventEmitter } from "node:events";
import memLog from "../src/memLog.js?real";

// 假线程池：只需要事件和 threads 数组
const fakePool = (n) => Object.assign(new EventEmitter(), { threads: Array(n).fill({}) });

const capture = (fn) => {
  const spy = spyOn(console, "log").mockImplementation(() => {});
  try {
    fn();
    return spy.mock.calls.map((args) => args.join(" "));
  } finally {
    spy.mockRestore();
  }
};

test("输出一行：内存各项、当前线程数、累计新建/销毁次数、对象类型前 5", () => {
  const pool = fakePool(3),
    mem = memLog(pool);
  pool.emit("workerDestroy", { id: 9 });
  const [line, ...rest] = capture(mem);
  expect(rest).toEqual([]);
  expect(line).toMatch(
    /^🧠 rss=\d+MB heap=\d+MB extra=\d+MB workers=0MB objects=\d+ threads=3 created=4 destroyed=1 top=([^,]+:\d+,){4}[^,]+:\d+$/,
  );
});

test("对象类型按数量从多到少排列", () => {
  const [line] = capture(memLog(fakePool(0))),
    counts = line
      .split("top=")[1]
      .split(",")
      .map((s) => +s.split(":").at(-1));
  expect(counts).toEqual([...counts].sort((a, b) => b - a));
});

test("订阅前已存在的线程计入新建；销毁只计订阅之后的；各实例互不影响", () => {
  const a = fakePool(5),
    b = fakePool(2);
  a.emit("workerDestroy", { id: 1 });
  const mem_a = memLog(a),
    mem_b = memLog(b);
  b.emit("workerDestroy", { id: 1 });
  b.emit("workerDestroy", { id: 2 });
  b.threads.push({});
  expect(capture(mem_a)[0]).toContain("threads=5 created=5 destroyed=0");
  expect(capture(mem_b)[0]).toContain("threads=3 created=5 destroyed=2");
});

test("字节按 1048576 换算成 MB 并四舍五入", () => {
  const spy = spyOn(process, "memoryUsage");
  try {
    for (const [bytes, want] of [
      [1.5 * 1048576, "rss=2MB "],
      [1.49 * 1048576, "rss=1MB "],
      [0, "rss=0MB "],
    ]) {
      spy.mockReturnValue({ rss: bytes });
      expect(capture(memLog(fakePool(0)))[0]).toStartWith("🧠 " + want);
    }
  } finally {
    spy.mockRestore();
  }
});

test("workers：各线程最近一次上报的堆之和，线程销毁后不再计入", () => {
  const pool = fakePool(2),
    mem = memLog(pool),
    workers = () => capture(mem)[0].match(/workers=(\d+)MB/)[1];
  expect(workers()).toBe("0");
  pool.emit("message", [1, 3 * 1048576]);
  pool.emit("message", [2, 4 * 1048576]);
  expect(workers()).toBe("7");
  pool.emit("message", [1, 10 * 1048576]);
  expect(workers()).toBe("14");
  pool.emit("workerDestroy", { id: 2 });
  expect(workers()).toBe("10");
});
