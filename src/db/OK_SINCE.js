import DB from "../DB.js";

// "srv_id:vps_id" → 最近一次异常的结束时刻（秒），供状态页展示"持续正常"时长
// 启动时从 errFixed 加载，运行期由 recover 更新；从未出过异常的项不在其中

const OK_SINCE = new Map();

(
  await DB.q("SELECT srv_id,vps_id,max(begin+duration) FROM errFixed GROUP BY srv_id,vps_id")
).forEach(([srv_id, vps_id, end]) => {
  OK_SINCE.set(srv_id + ":" + vps_id, +end);
});

export default OK_SINCE;
