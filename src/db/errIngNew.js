import DB from "../DB.js";
import txtId from "./txtId.js";
import { ALERT_COOLDOWN } from "../env.js";

const CERT_RE = /证书/;

// 落库并返回待通知事件 { name, err, pre }（由 Watch 汇总发送）；同文本或证书冷却期内返回 undefined
// begin：故障起始（两轮确认时为首次失败时刻）；错误文本变化时沿用原起始，故障时长不被重置
export default async (now, begin, errmap, err, name, srv_id, vps_id) => {
  const pre_err = errmap.get(vps_id);

  if (pre_err && err == pre_err[0]) {
    return;
  }

  if (pre_err) {
    begin = pre_err[1];
  }

  const txt_id = await txtId(err),
    [[id]] = await DB.q(
      `INSERT INTO errIng(vps_id,srv_id,txt_id,ts) VALUES (${vps_id},${srv_id},${txt_id},${begin}) ON CONFLICT (vps_id,srv_id) DO UPDATE SET txt_id=EXCLUDED.txt_id RETURNING id`,
    );

  // 证书告警冷却：证书类错误之间的文本变化（剩余天数逐日递减）在冷却期内只更新记录不通知
  const last_alert = pre_err?.[4] ?? begin,
    mute =
      pre_err && CERT_RE.test(err) && CERT_RE.test(pre_err[0]) && now - last_alert < ALERT_COOLDOWN;
  errmap.set(vps_id, [err, begin, id, txt_id, mute ? last_alert : now]);
  if (!mute) {
    return { name, err, pre: pre_err };
  }
};
