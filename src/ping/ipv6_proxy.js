import { GOOGLE_TRAN } from "../env.js";
import reqTxt from "@3-/req/reqTxt.js";
import assert from "node:assert/strict";

const URL = "https://translate-pa.googleapis.com/v1/translateHtml";

export default async (ip, auth, port) => {
  let traned = await reqTxt(URL, {
    proxy: `http://${auth}@${ip}:${port}`,
    headers: {
      "Content-Type": "application/json+protobuf",
      "X-Goog-API-Key": GOOGLE_TRAN,
    },
    method: "POST",
    body: JSON.stringify([[["I"], "en", "zh-CN"], "te_lib"]),
  });

  try {
    traned = JSON.parse(traned)[0][0];
  } catch (e) {
    throw new Error(e + " → " + traned);
  }
  assert.equal(traned, "我");
};
