import { test, expect } from "bun:test";
import dohData from "../src/ping/dohData.js";

const mockDoh = (r) => async () => r;

test("正常返回 data 列表", async () => {
  const r = { Status: 0, Answer: [{ data: "1.1.1.1" }, { data: "2.2.2.2" }] };
  expect(await dohData(mockDoh(r), "a.com", "A")).toEqual(["1.1.1.1", "2.2.2.2"]);
});

test("NOERROR 但无 Answer 字段返回空数组", async () => {
  expect(await dohData(mockDoh({ Status: 0 }), "a.com", "AAAA")).toEqual([]);
});

test("Status 非 0 抛出含响应体的错误", async () => {
  const r = { Status: 3, Comment: ["NXDOMAIN"] };
  expect(dohData(mockDoh(r), "a.com", "A")).rejects.toThrow("NXDOMAIN");
});
