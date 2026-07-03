import log from "@3-/console/log.js";
import send from "../send.js";
import DB from "../DB.js";
import OK_SINCE from "./OK_SINCE.js";
import { recoverText } from "../alertText.js";

export default async (now, name, srv_id, vps_id, [err, begin, errIng_id, txt_id]) => {
  OK_SINCE.set(srv_id + ":" + vps_id, now);
  const cost = now - begin;

  // 先落库（删本条 errIng、写 errFixed），再查剩余异常拼通知——
  // 列表带服务名/落点/已持续时长，含已不在监控清单里的遗留记录（便于发现僵尸异常）
  await Promise.all([
    DB.q("DELETE FROM errIng WHERE id=" + errIng_id),
    DB.q(
      `INSERT INTO errFixed(id,vps_id,srv_id,txt_id,begin,duration) VALUES (${errIng_id},${vps_id},${srv_id},${txt_id},${begin},${cost < 0 ? 0 : cost}) ON CONFLICT (id) DO UPDATE SET duration=EXCLUDED.duration`,
    ),
  ]);
  const remain = await DB.q(
    "SELECT s.val,v.hostname,e.ts FROM errIng e JOIN srv s ON s.id=e.srv_id JOIN vps v ON v.id=e.vps_id ORDER BY e.ts",
  );

  const msg = "✅ " + name + " 已恢复";
  log(msg, "故障时长", cost + "s，剩余异常", remain.length);
  await send(msg, recoverText(now, +begin, err, remain));
};
