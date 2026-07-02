import { test, expect } from "bun:test";
import stateBuild from "../src/stateBuild.js";

// id 模拟 PG bigint 返回的字符串
const VPS_ID_IP = new Map([
  ["a.host", ["1", "1.1.1.1"]],
  ["b.host", ["2", "2.2.2.2"]],
  ["c.host", ["3", "3.3.3.3"]],
]);

const NO_SINCE = new Map();

test("全 ok", () => {
  const task = new Map([
    ["srv1", [["10", "tag1", "a.host"]]],
    ["srv2", [["11", "tag2", "b.host"]]],
  ]);
  expect(stateBuild(task, new Map(), VPS_ID_IP, NO_SINCE, 100)).toEqual({
    ts: 100,
    err: [],
    ok: [
      ["srv1", "tag1", "a.host", null],
      ["srv2", "tag2", "b.host", null],
    ],
  });
});

test("有异常", () => {
  const task = new Map([
    [
      "srv1",
      [
        ["10", "tag1", "a.host"],
        ["10", "tag1", "b.host"],
      ],
    ],
  ]);
  const err = new Map([["10", new Map([["2", ["连接超时", 90, "5", "7"]]])]]);
  expect(stateBuild(task, err, VPS_ID_IP, NO_SINCE, 100)).toEqual({
    ts: 100,
    err: [["srv1", "tag1", "b.host", 90, "连接超时"]],
    ok: [["srv1", "tag1", "a.host", null]],
  });
});

test("vps 数组取 vps[0] 的 id", () => {
  const task = new Map([["srv1", [["10", "tag1", ["b.host", "c.host"]]]]]);
  const err = new Map([["10", new Map([["2", ["主从异常", 80, "5", "7"]]])]]);
  expect(stateBuild(task, err, VPS_ID_IP, NO_SINCE, 100)).toEqual({
    ts: 100,
    err: [["srv1", "tag1", ["b.host", "c.host"], 80, "主从异常"]],
    ok: [],
  });
  // 无异常时 vps 数组也保持原样
  expect(stateBuild(task, new Map(), VPS_ID_IP, NO_SINCE, 100).ok).toEqual([
    ["srv1", "tag1", ["b.host", "c.host"], null],
  ]);
});

test("tag 为 undefined 输出空字符串", () => {
  const task = new Map([["srv1", [["10", undefined, "a.host"]]]]);
  const err = new Map([["10", new Map([["1", ["坏了", 70, "5", "7"]]])]]);
  expect(stateBuild(task, err, VPS_ID_IP, NO_SINCE, 100).err).toEqual([
    ["srv1", "", "a.host", 70, "坏了"],
  ]);
  expect(stateBuild(task, new Map(), VPS_ID_IP, NO_SINCE, 100).ok).toEqual([
    ["srv1", "", "a.host", null],
  ]);
});

test("ok_since：出过异常的项带上次结束时刻，没出过的为 null", () => {
  const task = new Map([
    [
      "srv1",
      [
        ["10", "tag1", "a.host"],
        ["10", "tag1", "b.host"],
      ],
    ],
  ]);
  const okSince = new Map([["10:1", 42]]);
  expect(stateBuild(task, new Map(), VPS_ID_IP, okSince, 100).ok).toEqual([
    ["srv1", "tag1", "a.host", 42],
    ["srv1", "tag1", "b.host", null],
  ]);
});

test("task 为空 Map", () => {
  expect(stateBuild(new Map(), new Map(), VPS_ID_IP, NO_SINCE, 100)).toEqual({
    ts: 100,
    err: [],
    ok: [],
  });
});
