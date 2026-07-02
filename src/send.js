#!/usr/bin/env bun

import Send from "@8v/send";
import { LARK, PUSHPLUS } from "./env.js";

const send = Send({ LARK, PUSHPLUS });

export default (title, body) => {
  console.log(title, body);
  return send(title, body);
};
