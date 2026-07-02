import DB from "../DB.js";

// srv_id : vps_id :  [err, ts, errIng_id, txt_id]

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
