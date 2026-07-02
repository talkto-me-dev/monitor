#!/usr/bin/env bun
// 不要用 node， node 下 fetch 没有 proxy 参数

import "@3-/default";
import loadYml from "./loadYml.js";
import srvId from "./db/srvId.js";
import Watch from "./Watch.js";
import send from "./send.js";
import SRV from "./SRV.js";

const TASK = new Map(),
  watch = async () => {
    try {
      await Watch(TASK);
    } catch (e) {
      await send("监控异常", e);
    }
  };

await Promise.all(
  Object.entries(loadYml("watch")).map(async ([srv_tag, args]) => {
    const srv_id = await srvId(srv_tag),
      [srv, tag] = srv_tag.split("/"),
      task = TASK.default(srv, () => []),
      push = (args) => task.push([srv_id, ...args]);
    SRV[srv](tag, push, args);
  }),
);

await watch();
setInterval(watch, 6e4);
