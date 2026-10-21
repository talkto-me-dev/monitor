import { parentPort, threadId } from "node:worker_threads";
import { heapSize } from "bun:jsc";

// 实测 Bun 工作线程长期不做完整 GC，可回收的垃圾一直算在堆里（线性上涨，强制 GC 即回落）。
// 每个线程每 10 分钟在任务结束后强制一次完整 GC，并上报回收后仍占用的堆（src/memLog.js 汇总），
// 既释放垃圾，也让上报值反映真实占用；首个任务结束即 GC 一次作为基线。
// GC 在探测完成之后执行：不计入 http 的 max_ms，但计入 ping.js 的 30s 超时并占住本线程
// （实测 165MB 存活堆约 50ms，可忽略）。用单调时钟，系统时间回拨不会让 GC 停摆。
// 超时中止时线程被直接终止、不会上报，该线程的记录由 memLog 在 workerDestroy 时删除
const GC_INTERVAL = 6e5;
let last_gc = -Infinity;

export default async ([srv, args]) => {
  try {
    return await (await import("../ping/" + srv + ".js")).default(...args);
  } finally {
    const now = performance.now();
    if (now - last_gc >= GC_INTERVAL) {
      last_gc = now;
      Bun.gc(true);
      parentPort.postMessage([threadId, heapSize()]);
    }
  }
};
