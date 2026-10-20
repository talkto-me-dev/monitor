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
  pool.emit("workerDestroy");
  const [line, ...rest] = capture(mem);
  expect(rest).toEqual([]);
  expect(line).toMatch(
    /^🧠 rss=\d+MB heap=\d+MB extra=\d+MB objects=\d+ threads=3 created=4 destroyed=1 top=(\S+:\d+,){4}\S+:\d+$/,
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
  a.emit("workerDestroy");
  const mem_a = memLog(a),
    mem_b = memLog(b);
  b.emit("workerDestroy");
  b.emit("workerDestroy");
  b.threads.push({});
  expect(capture(mem_a)[0]).toContain("threads=5 created=5 destroyed=0");
  expect(capture(mem_b)[0]).toContain("threads=3 created=5 destroyed=2");
});
