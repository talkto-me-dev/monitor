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

  // 可用率行名 = srv 表键名（顶层键，如 mysql/tidb-prod-intl），只收本次在监控的 srv_id。
  // 不能用 push 时的 tag 拼名：tag 留空的类型（mysql、裸键域名）会同名互吞，
  // uptimeBuild 按名称去重后只剩第一行，其余实例的故障数据被丢弃
  const active = new Set();
  for (const [, li] of task) {
    for (const [srv_id] of li) {
      active.add(srv_id);
    }
  }
  const ongoing = [];
  ERR.forEach((m, srv_id) => m.forEach(([, ts]) => ongoing.push([srv_id, ts])));

  const win_start = now - DAYS * 86400;
  const [fixed, srv_rows] = await Promise.all([
    DB.q("SELECT srv_id,begin,duration FROM errFixed WHERE begin+duration > $1", win_start),
    DB.q("SELECT id,val,ctime FROM srv"),
  ]);
  const names = new Map(),
    ctime = new Map();
  srv_rows.forEach(([id, val, ts]) => {
    if (active.has(id)) {
      names.set(id, val);
    }
    ctime.set(id, ts);
  });
  state.up = uptimeBuild({
    fixed,
    ongoing,
    ctime,
    names,
    now,
    days: DAYS,
  });

  return R.setex("status:state", 864e3, JSON.stringify(state));
};
