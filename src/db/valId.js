import DB from "../DB.js";

// val → id 映射表（如 srv 表），启动时全量加载缓存

export default async (table) => {
  const cache = new Map(await DB.q("SELECT val,id FROM " + table)),
    select = "SELECT id FROM " + table + " WHERE val=$1",
    qId = async (val) => {
      let id = cache.get(val);
      if (id) return id;
      [id] = await DB.q(select, val);
      if (id) {
        [id] = id;
        cache.set(val, id);
        return id;
      }
    };
  return async (val) => {
    const id = await qId(val);
    if (id) return id;
    try {
      return (await DB.q("INSERT INTO " + table + "(val) VALUES ($1) RETURNING id", val))[0][0];
    } catch (err) {
      if (DB.isDup(err)) return qId(val);
      throw err;
    }
  };
};
