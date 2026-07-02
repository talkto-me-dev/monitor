import log from "@3-/console/log.js";
import send from "../send.js";
import DB from "../DB.js";
import ERR from "./ERR.js";

export default async (now, name, srv_id, vps_id, [_, begin, errIng_id, txt_id]) => {
  const cost = now - begin,
    msg = "✅ " + name;

  let txt = "恢复耗时 " + Math.floor(cost / 6) / 10 + " 分钟";

  log(msg + " " + txt);

  txt += "\n\n";

  let err_count = 0;
  ERR.forEach((v) => {
    err_count += v.size;
  });
  if (err_count) {
    txt += `还有 ${err_count} 个异常`;
  } else {
    txt += `🎉 所有异常全部恢复！`;
  }

  await Promise.all([
    send(msg, txt),
    DB.q("DELETE FROM errIng WHERE id=" + errIng_id),
    DB.q(
      `INSERT INTO errFixed(id,vps_id,srv_id,txt_id,begin,duration) VALUES (${errIng_id},${vps_id},${srv_id},${txt_id},${begin},${cost < 0 ? 0 : cost}) ON CONFLICT (id) DO UPDATE SET duration=EXCLUDED.duration`,
    ),
  ]);
};
