import { test, expect, mock } from "bun:test";

// DoH 与 SMTP 握手全部 mock：fail 决定哪些 IP 失败、delay 控制完成先后
let fail = new Set(),
  delay = {};
const DNS = { A: ["1.1.1.1", "2.2.2.2"], AAAA: ["::1", "::2"] };

mock.module("@3-/doh/cf.js", () => ({
  default: async (_, type) => ({ Status: 0, Answer: DNS[type].map((data) => ({ data })) }),
}));
mock.module("@3-/tls_smtp", () => ({
  default: async (_user, _pwd, ip) => {
    await new Promise((r) => setTimeout(r, delay[ip] ?? 0));
    if (fail.has(ip)) throw new Error("Connection timeout");
  },
}));

const smtp = (await import("../src/ping/smtp.js")).default;

const ARGS = {
  host: "smtp.x.com",
  user: "u",
  password: "p",
  vps: [
    ["a", { v4: "1.1.1.1", v6: "::1" }],
    ["b", { v4: "2.2.2.2", v6: "::2" }],
  ],
};

const errOf = async (args = structuredClone(ARGS)) => {
  try {
    await smtp(args);
  } catch (err) {
    return err.message;
  }
};

test("全部正常 → 不抛错", async () => {
  fail = new Set();
  expect(await errOf()).toBeUndefined();
});

test("v6 先于 v4 失败，文本仍按 机器 → v4 → v6 排列", async () => {
  fail = new Set(["1.1.1.1", "::1", "::2"]);
  const expected =
    "smtp.x.com SMTP 异常 : a 1.1.1.1 Error: Connection timeout\n" +
    "smtp.x.com SMTP 异常 : a ::1 Error: Connection timeout\n" +
    "smtp.x.com SMTP 异常 : b ::2 Error: Connection timeout";
  delay = { "1.1.1.1": 30 };
  expect(await errOf()).toBe(expected);
  delay = { "::1": 30, "::2": 10 };
  expect(await errOf()).toBe(expected);
});

test("DNS 缺失与多余记录也在固定位置", async () => {
  fail = new Set(["::2"]);
  delay = {};
  const args = structuredClone(ARGS);
  args.vps[1][1].v4 = "3.3.3.3"; // DNS 里没有 3.3.3.3，且 2.2.2.2 多余
  expect(await errOf(args)).toBe(
    "域名解析缺失 b 3.3.3.3\n" +
      "smtp.x.com SMTP 异常 : b ::2 Error: Connection timeout\n" +
      "域名smtp.x.com解析异常（重复指向/未预期的地址) :2.2.2.2",
  );
});
