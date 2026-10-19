import DB from "../DB.js";

// srv_id : vps_id : [err, begin 故障起始秒, errIng_id, txt_id, last_alert 上次通知秒]
// 启动时从 errIng 表加载：begin 为 bigint 字符串，且没有 last_alert（证书冷却回落到 begin）

const ERR = new Map();

await (async () => {
  const err_ing = await DB.q("SELECT srv_id,vps_id,txt_id,ts,id FROM errIng");

  if (!err_ing.length) return;

  const ids = err_ing.map((li) => li[2]),
    id_txt = new Map(
      await DB.q(
        "SELECT id,val FROM txt WHERE id IN (" + ids.map((_, i) => "$" + (i + 1)) + ")",
        ...ids,
      ),
    );

  return Promise.all(
    err_ing.map(([srv_id, vps_id, txt_id, ts, id]) => {
      ERR.default(srv_id, () => new Map()).set(vps_id, [id_txt.get(txt_id), ts, id, txt_id]);
    }),
  );
})();

export default ERR;
