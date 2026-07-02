import { blake3 } from "@3-/blake3";
import DB from "../DB.js";

// 文本 → txt 表 id（按 blake3 hash 去重）

const qId = async (hash) => {
  const [id] = await DB.q("SELECT id FROM txt WHERE hash=$1", hash);
  if (id) return id[0];
};

export default async (txt) => {
  const hash = blake3(txt),
    id = await qId(hash);
  if (id) return id;
  try {
    return (await DB.q("INSERT INTO txt (val, hash) VALUES ($1,$2) RETURNING id", txt, hash))[0][0];
  } catch (err) {
    if (DB.isDup(err)) return qId(hash);
    throw err;
  }
};
