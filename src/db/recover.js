import log from "@3-/console/log.js";
import DB from "../DB.js";
import OK_SINCE from "./OK_SINCE.js";

// 落库（写 errFixed、删本条 errIng）并返回待通知事件 { name, begin, err, ok: true }（由 Watch 汇总发送）
// 先写后删、成功后才改内存：任一步失败时 errIng 仍在，下一轮重试 recover（两步都幂等）
export default async (now, name, srv_id, vps_id, [err, begin, errIng_id, txt_id]) => {
  const cost = now - begin;

  await DB.q(
    `INSERT INTO errFixed(id,vps_id,srv_id,txt_id,begin,duration) VALUES (${errIng_id},${vps_id},${srv_id},${txt_id},${begin},${cost < 0 ? 0 : cost}) ON CONFLICT (id) DO UPDATE SET duration=EXCLUDED.duration`,
  );
  await DB.q("DELETE FROM errIng WHERE id=" + errIng_id);
  OK_SINCE.set(srv_id + ":" + vps_id, now);

  log("✅", name, "已恢复，故障时长", cost + "s");
  return { name, begin: +begin, err, ok: true };
};
