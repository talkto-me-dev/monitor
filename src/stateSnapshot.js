import R from "./R.js";
import DB from "./DB.js";
import ERR from "./db/ERR.js";
import VPS_ID_IP from "./db/VPS_ID_IP.js";
import OK_SINCE from "./db/OK_SINCE.js";
import stateBuild from "./stateBuild.js";
import uptimeBuild from "./uptimeBuild.js";

const DAYS = 90;

// 全量状态快照写 Redis，供 monitor-watch 状态页读取；10 天过期兜底
export default async (task, now) => {
  const state = stateBuild(task, ERR, VPS_ID_IP, OK_SINCE, now);

  // srv_id → 展示名（同 srv_id 多任务如 ipv6_proxy 多主机，uptimeBuild 内去重为一行）
  const names = new Map();
  for (const [srv, li] of task) {
    for (const [srv_id, tag] of li) {
      names.set(srv_id, srv + (tag ? "/" + tag : ""));
    }
  }
  const ongoing = [];
  ERR.forEach((m, srv_id) => m.forEach(([, ts]) => ongoing.push([srv_id, ts])));

  const win_start = now - DAYS * 86400;
  const [fixed, ctime] = await Promise.all([
    DB.q("SELECT srv_id,begin,duration FROM errFixed WHERE begin+duration > $1", win_start),
    DB.q("SELECT id,ctime FROM srv"),
  ]);
  state.up = uptimeBuild({
    fixed,
    ongoing,
    ctime: new Map(ctime),
    names,
    now,
    days: DAYS,
  });

  return R.setex("status:state", 864e3, JSON.stringify(state));
};
