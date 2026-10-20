import { parentPort, threadId } from "node:worker_threads";
import { heapSize } from "bun:jsc";

// 每次任务结束（含失败）上报本线程 JS 堆大小，由 src/memLog.js 汇总，用于排查内存增长；
// heapSize 在 GC 时更新，反映的是回收后仍占用的部分，正适合看趋势
// 超时中止时线程被直接终止、不会上报，该线程的记录由 memLog 在 workerDestroy 时删除
export default async ([srv, args]) => {
  try {
    return await (await import("../ping/" + srv + ".js")).default(...args);
  } finally {
    parentPort.postMessage([threadId, heapSize()]);
  }
};
