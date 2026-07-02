import R from "./R.js";
import ERR from "./db/ERR.js";
import VPS_ID_IP from "./db/VPS_ID_IP.js";
import stateBuild from "./stateBuild.js";

// 全量状态快照写 Redis，供 monitor-watch 状态页读取；10 天过期兜底
export default (task, now) =>
  R.setex("status:state", 864e3, JSON.stringify(stateBuild(task, ERR, VPS_ID_IP, now)));
