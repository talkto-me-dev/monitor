import { test, expect } from "bun:test";
import stateBuild from "../src/stateBuild.js";

// id 模拟 PG bigint 返回的字符串
const VPS_ID_IP = new Map([
  ["a.host", ["1", "1.1.1.1"]],
  ["b.host", ["2", "2.2.2.2"]],
  ["c.host", ["3", "3.3.3.3"]],
]);

test("全 ok", () => {
  const task = new Map([
    ["srv1", [["10", "tag1", "a.host"]]],
    ["srv2", [["11", "tag2", "b.host"]]],
  ]);
  expect(stateBuild(task, new Map(), VPS_ID_IP, 100)).toEqual({
    ts: 100,
    err: [],
    ok: [
      ["srv1", "tag1", "a.host"],
      ["srv2", "tag2", "b.host"],
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
  expect(stateBuild(task, err, VPS_ID_IP, 100)).toEqual({
    ts: 100,
    err: [["srv1", "tag1", "b.host", 90, "连接超时"]],
    ok: [["srv1", "tag1", "a.host"]],
  });
});

test("vps 数组取 vps[0] 的 id", () => {
  const task = new Map([["srv1", [["10", "tag1", ["b.host", "c.host"]]]]]);
  const err = new Map([["10", new Map([["2", ["主从异常", 80, "5", "7"]]])]]);
  expect(stateBuild(task, err, VPS_ID_IP, 100)).toEqual({
    ts: 100,
    err: [["srv1", "tag1", ["b.host", "c.host"], 80, "主从异常"]],
    ok: [],
  });
  // 无异常时 vps 数组也保持原样
  expect(stateBuild(task, new Map(), VPS_ID_IP, 100).ok).toEqual([
    ["srv1", "tag1", ["b.host", "c.host"]],
  ]);
});

test("tag 为 undefined 输出空字符串", () => {
  const task = new Map([["srv1", [["10", undefined, "a.host"]]]]);
  const err = new Map([["10", new Map([["1", ["坏了", 70, "5", "7"]]])]]);
  expect(stateBuild(task, err, VPS_ID_IP, 100).err).toEqual([["srv1", "", "a.host", 70, "坏了"]]);
  expect(stateBuild(task, new Map(), VPS_ID_IP, 100).ok).toEqual([["srv1", "", "a.host"]]);
});

test("task 为空 Map", () => {
  expect(stateBuild(new Map(), new Map(), VPS_ID_IP, 100)).toEqual({ ts: 100, err: [], ok: [] });
});
