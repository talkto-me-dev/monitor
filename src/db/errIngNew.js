import DB from "../DB.js";
import txtId from "./txtId.js";
import send from "../send.js";
import { errText } from "../alertText.js";
import { ALERT_COOLDOWN } from "../env.js";

const CERT_RE = /证书/;

export default async (now, errmap, err, name, srv_id, vps_id) => {
  const pre_err = errmap.get(vps_id);

  if (pre_err && err == pre_err[0]) {
    return;
  }

  const txt_id = await txtId(err);

  if (pre_err && CERT_RE.test(err) && CERT_RE.test(pre_err[0])) {
    const last_alert = pre_err[4] ?? pre_err[1];
    if (now - last_alert < ALERT_COOLDOWN) {
      const [r] = await DB.q(
        `INSERT INTO errIng(vps_id,srv_id,txt_id,ts) VALUES (${vps_id},${srv_id},${txt_id},${now}) ON CONFLICT (vps_id,srv_id) DO UPDATE SET txt_id=EXCLUDED.txt_id RETURNING id`,
      );
      errmap.set(vps_id, [err, pre_err[1], r[0], txt_id, last_alert]);
      return;
    }
  }

  const [r] = await Promise.all([
    DB.q(
      `INSERT INTO errIng(vps_id,srv_id,txt_id,ts) VALUES (${vps_id},${srv_id},${txt_id},${now}) ON CONFLICT (vps_id,srv_id) DO UPDATE SET txt_id=EXCLUDED.txt_id RETURNING id`,
    ),
    send("❌ " + name + " 故障", errText(err, pre_err)),
  ]);
  errmap.set(vps_id, [err, now, r[0][0], txt_id, now]);
};
