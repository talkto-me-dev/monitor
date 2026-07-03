import R from "./R.js";
import raise from "@3-/raise";
import int from "@3-/int";
import send from "./send.js";
import { dur } from "./alertText.js";

// monitor-watch 是部署在 Cloudflare 的反向守护：本监控挂掉时由它告警
const NOTE =
  "\n\nmonitor-watch 是 Cloudflare 上的反向守护（本监控挂掉时由它告警），它失联期间本监控无人守护，请检查 Cloudflare Worker";

const statusWatch = async (now) => {
  const p = R.pipeline(),
    now_minute = int(now / 60);
  p.get("status-watch:ts");
  p.setex("status:ts", 864e3, now_minute);
  const status_watch_minute = (await p.exec())[0][1];
  if (!status_watch_minute) {
    raise("Redis 中没有 monitor-watch 的心跳（可能未部署，或已停摆超过心跳过期时间）");
  }
  const diff = now_minute - status_watch_minute;
  if (diff > 10) {
    raise("最后心跳在 " + diff + " 分钟前（阈值 10 分钟）");
  }
};

let STATUS_WATCH_ERR = 0;

export default async (now) => {
  try {
    await statusWatch(now);
    if (STATUS_WATCH_ERR) {
      await send("✅ monitor-watch 已恢复", "失联持续 " + dur(now - STATUS_WATCH_ERR));
      STATUS_WATCH_ERR = 0;
    }
  } catch (e) {
    if (!STATUS_WATCH_ERR) {
      STATUS_WATCH_ERR = now;
      await send("❌ monitor-watch 失联", (e.message || String(e)) + NOTE);
    }
  }
};
