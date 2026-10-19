import Redis from "ioredis";
import { REDIS } from "./env.js";

// 不用 @3-/ioredis：它的 retryStrategy 重连 6 次后直接 throw，断网一分多钟就会打挂进程。
// 这里永远重连（间隔逐步拉长到 10s），单条命令 10s 超时，Redis 不可用只影响快照/心跳，不拖住探测轮次
const R = new Redis({
  ...REDIS,
  retryStrategy: (times) => Math.min(times * 1e3, 1e4),
  commandTimeout: 1e4,
});

R.on("error", (err) => console.error("redis", err.message));

export default R;
