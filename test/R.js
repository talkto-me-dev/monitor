#!/usr/bin/env bun

import R from "../src/R.js";

const KEY = "test.status.R.js";

await R.set(KEY, "value");
console.log(await R.get(KEY));

await R.del(KEY);
console.log(await R.get(KEY));

process.exit();
