#!/usr/bin/env bun
// 不要用 node， node 下 fetch 没有 proxy 参数

import "@3-/default";
import loadYml from "./loadYml.js";
import srvId from "./db/srvId.js";
import Watch from "./Watch.js";
import send from "./send.js";
import SRV from "./SRV.js";
import { WATCHDOG } from "./env.js";

// systemd 看门狗心跳：一轮跑完才发，主循环卡死则 WatchdogSec 后被 systemd 杀掉重启
const alive = WATCHDOG
  ? () => Bun.spawn(["systemd-notify", "--pid=" + process.pid, "WATCHDOG=1"])
  : () => {};

const TASK = new Map(),
  watch = async () => {
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
  };

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
