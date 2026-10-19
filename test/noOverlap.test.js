import { test, expect } from "bun:test";
import noOverlap from "../src/noOverlap.js";

// 可手动结束的任务：每次调用返回一个待 resolve/reject 的 promise
const job = () => {
  const pending = [];
  let runs = 0;
  const fn = () => {
    ++runs;
    return new Promise((resolve, reject) => pending.push({ resolve, reject }));
  };
  return { fn, pending, runs: () => runs };
};

test("上一次未结束：跳过并调用 onSkip，不再执行任务", async () => {
  const j = job();
  let skips = 0;
  const run = noOverlap(j.fn, () => ++skips);
  const first = run();
  await run();
  await run();
  expect(j.runs()).toBe(1);
  expect(skips).toBe(2);
  j.pending[0].resolve("done");
  expect(await first).toBe("done");
});

test("上一次结束后：下一次正常执行", async () => {
  const j = job();
  const run = noOverlap(j.fn, () => {});
  const first = run();
  j.pending[0].resolve();
  await first;
  run();
  expect(j.runs()).toBe(2);
});

test("上一次抛错也会释放：错误照常抛出，下一次正常执行", async () => {
  const j = job();
  const run = noOverlap(j.fn, () => {});
  const first = run();
  j.pending[0].reject(new Error("boom"));
  await expect(first).rejects.toThrow("boom");
  run();
  expect(j.runs()).toBe(2);
});
