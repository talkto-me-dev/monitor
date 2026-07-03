import DB from "../DB.js";
import txtId from "./txtId.js";
import send from "../send.js";
import { errText } from "../alertText.js";

export default async (now, errmap, err, name, srv_id, vps_id) => {
  const pre_err = errmap.get(vps_id);

  if (pre_err && err == pre_err[0]) {
    return;
  }

  const txt_id = await txtId(err),
    [r] = await Promise.all([
      DB.q(
        `INSERT INTO errIng(vps_id,srv_id,txt_id,ts) VALUES (${vps_id},${srv_id},${txt_id},${now}) ON CONFLICT (vps_id,srv_id) DO UPDATE SET txt_id=EXCLUDED.txt_id RETURNING id`,
      ),
      send("❌ " + name + " 故障", errText(err, pre_err)),
    ]);
  errmap.set(vps_id, [err, now, r[0][0], txt_id]);
};
