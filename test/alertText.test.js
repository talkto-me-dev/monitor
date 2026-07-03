import { test, expect } from "bun:test";
import { dur, dt8, errText, recoverText } from "../src/alertText.js";

const TS = Date.UTC(2026, 6, 3, 10, 56) / 1000; // 东八区 2026-07-03 18:56

test("dur：秒/分钟/小时/天分级，分钟一位小数", () => {
  expect(dur(45)).toBe("45 秒");
  expect(dur(1770)).toBe("29.5 分钟");
  expect(dur("1770")).toBe("29.5 分钟"); // DB bigint 字符串
  expect(dur(6000)).toBe("1.6 小时");
  expect(dur(200000)).toBe("2 天");
});

test("dt8：东八区 MM-DD HH:mm", () => {
  expect(dt8(TS)).toBe("07-03 18:56");
  expect(dt8(String(TS))).toBe("07-03 18:56");
});

test("errText：新故障只给错误文本，错误变更附旧错误与起始时间", () => {
  expect(errText("boom")).toBe("boom");
  expect(errText("new err", ["old err", TS])).toBe(
    "**错误**：new err\n**此前**：old err（07-03 18:56 起）",
  );
});

test("recoverText：无剩余异常 → 🎉", () => {
  const txt = recoverText(TS + 1770, TS, "boom", []);
  expect(txt).toContain("**故障时长**：29.5 分钟（07-03 18:56 → 07-03 19:25）");
  expect(txt).toContain("**错误内容**：boom");
  expect(txt).toContain("🎉 全部服务已恢复正常");
});

test("recoverText：剩余异常逐条列出，落点与服务名重复时不重复展示", () => {
  const txt = recoverText(TS, TS - 600, "", [
    ["redis_sentinel/contabo.us", "c-us-02", TS - 86400 * 3],
    ["mysql/tidb-alpha-intl", "tidb-alpha-intl", TS - 120],
  ]);
  expect(txt).toContain("**其余 2 个异常仍在持续**");
  expect(txt).toContain("- redis_sentinel/contabo.us · c-us-02（已持续 3 天）");
  expect(txt).toContain("- mysql/tidb-alpha-intl（已持续 2 分钟）"); // 无 " · tidb-alpha-intl"
  expect(txt).not.toContain("🎉");
});

test("recoverText：超过 10 条截断", () => {
  const remain = Array.from({ length: 12 }, (_, i) => ["srv" + i, "vps" + i, TS - 60]);
  const txt = recoverText(TS, TS - 60, "", remain);
  expect(txt).toContain("**其余 12 个异常仍在持续**");
  expect(txt).toContain("- …等共 12 个");
  expect(txt).not.toContain("srv11");
});
