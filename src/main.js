#!/usr/bin/env bun
// 不要用 node， node 下 fetch 没有 proxy 参数

import "@3-/default";
import loadYml from "./loadYml.js";
import srvId from "./db/srvId.js";
import Watch from "./Watch.js";
import send from "./send.js";
import SRV from "./SRV.js";
import { WATCHDOG } from "./env.js";
import noOverlap from "./noOverlap.js";
import memLog from "./memLog.js";
import THREAD_POOL from "./var/THREAD_POOL.js";

// systemd 看门狗心跳：一轮跑完才发，主循环卡死则 WatchdogSec 后被 systemd 杀掉重启
const alive = WATCHDOG
  ? () => Bun.spawn(["systemd-notify", "--pid=" + process.pid, "WATCHDOG=1"])
  : () => {};

// 内存每小时涨约 14MB，原因未定位：每 10 分钟打一行内存日志用于排查（须在首轮探测前订阅线程池事件）
const mem = memLog(THREAD_POOL);

// 一轮最坏约 65s（30s 超时 + 5s + 重试 30s），会超过 60s 间隔：上一轮未结束就跳过本轮，
// 避免同一探测并发执行读到过期状态；跳过的轮次不发看门狗心跳，单轮卡死也会被 systemd 发现
const TASK = new Map(),
  watch = noOverlap(
    async () => {
      try {
        await Watch(TASK);
      } catch (e) {
        try {
          await send("❌ 监控自身异常", "本轮部分步骤失败：" + e.message);
        } catch (err) {
          console.error("send", err);
        }
      }
      alive();
    },
    () => console.log("⏭ 上一轮未结束，跳过本轮"),
  );

await Promise.all(
  Object.entries(loadYml("watch")).map(async ([srv_tag, args]) => {
    const srv_id = await srvId(srv_tag),
      [srv, tag] = srv_tag.split("/"),
      task = TASK.default(srv, () => []),
      push = (args) => task.push([srv_id, ...args]);
    await SRV[srv](tag, push, args);
  }),
);

await watch();
setInterval(watch, 6e4);

mem();
setInterval(mem, 6e5);
