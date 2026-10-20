// 内存排查日志：heap/extra 只统计主线程（extra 是 ArrayBuffer 等堆外内存），
// rss 是整个进程、包含每个工作线程各自的 JS 堆；rss 远大于 heap 时差值在工作线程或原生内存里，
// 配合 threads/destroyed 判断是不是线程反复新建造成的；workers 是各工作线程最近一次上报的 JS 堆之和
// （src/var/worker.js 每次任务结束上报），用来区分工作线程堆积和原生内存泄漏
import { heapStats } from "bun:jsc";

const MB = (n) => Math.round(n / 1048576) + "MB";

// 启动时的线程在订阅前就已创建，workerCreate 会漏计；
// 而每个建过的线程要么还在、要么已销毁，所以 累计新建 = 当前线程数 + 累计销毁
export default (pool) => {
  let destroyed = 0;
  const worker_heap = new Map();
  pool.on("message", ([thread_id, heap]) => worker_heap.set(thread_id, heap));
  pool.on("workerDestroy", (worker) => {
    ++destroyed;
    worker_heap.delete(worker.id);
  });
  return () => {
    const { rss } = process.memoryUsage(),
      threads = pool.threads.length,
      worker_heap_sum = worker_heap.values().reduce((a, b) => a + b, 0),
      { heapSize, extraMemorySize, objectCount, objectTypeCounts } = heapStats(),
      top = Object.entries(objectTypeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([type, n]) => type + ":" + n)
        .join(",");
    console.log(
      `🧠 rss=${MB(rss)} heap=${MB(heapSize)} extra=${MB(extraMemorySize)} workers=${MB(worker_heap_sum)} objects=${objectCount} threads=${threads} created=${threads + destroyed} destroyed=${destroyed} top=${top}`,
    );
  };
};
