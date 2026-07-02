#!/usr/bin/env bun

import Send from "@8v/send";
import larkCard from "./larkCard.js";
import { LARK, PUSHPLUS, STATUS_PAGE } from "./env.js";

const FOOT = STATUS_PAGE ? "📊 [服务状态页](" + STATUS_PAGE + ")" : "";

const send_li = [];
if (LARK) {
  send_li.push(larkCard(LARK, FOOT));
}
if (PUSHPLUS) {
  send_li.push(Send({ PUSHPLUS }));
}

export default async (title, body = "") => {
  body = String(body);
  console.log(title, body);
  const fail_li = (await Promise.allSettled(send_li.map((s) => s(title, body)))).filter(
    (r) => r.reason,
  );
  if (fail_li.length) {
    throw new Error(fail_li.map((r) => r.reason?.message).join(" | "));
  }
};
