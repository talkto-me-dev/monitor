import { test, expect } from "bun:test";
import { dur, dt8, errText, errCard, recoverCard } from "../src/alertText.js";

// 单条恢复卡片的正文（标题另有用例覆盖）
const recoverBody = (now, begin, err, remain) =>
  recoverCard(now, [{ name: "x", begin, err }], remain)[1];

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

test("恢复正文：无剩余异常 → 🎉", () => {
  const txt = recoverBody(TS + 1770, TS, "boom", []);
  expect(txt).toContain("**故障时长**：29.5 分钟（07-03 18:56 → 07-03 19:25）");
  expect(txt).toContain("**错误内容**：boom");
  expect(txt).toContain("🎉 全部服务已恢复正常");
});

test("恢复正文：剩余异常逐条列出，落点与服务名重复时不重复展示", () => {
  const txt = recoverBody(TS, TS - 600, "", [
    ["redis_sentinel/contabo.us", "c-us-02", TS - 86400 * 3],
    ["mysql/tidb", "alpha-ai", TS - 300],
    ["http/api.example.com", "api.example.com", TS - 120],
  ]);
  expect(txt).toContain("**其余 3 个异常仍在持续**");
  expect(txt).toContain("- redis_sentinel/contabo.us · c-us-02（已持续 3 天）");
  expect(txt).toContain("- mysql/tidb · alpha-ai（已持续 5 分钟）");
  expect(txt).toContain("- http/api.example.com（已持续 2 分钟）"); // 无 " · api.example.com"
  expect(txt).not.toContain("🎉");
});

test("恢复正文：超过 10 条截断", () => {
  const remain = Array.from({ length: 12 }, (_, i) => ["srv" + i, "vps" + i, TS - 60]);
  const txt = recoverBody(TS, TS - 60, "", remain);
  expect(txt).toContain("**其余 12 个异常仍在持续**");
  expect(txt).toContain("- …等共 12 个");
  expect(txt).not.toContain("srv11");
});

test("errCard：单条沿用原文案", () => {
  expect(errCard([{ name: "smtp/x:a", err: "boom" }])).toEqual(["❌ smtp/x:a 故障", "boom"]);
  expect(errCard([{ name: "smtp/x:a", err: "new", pre: ["old", TS] }])).toEqual([
    "❌ smtp/x:a 故障",
    "**错误**：new\n**此前**：old（07-03 18:56 起）",
  ]);
});

test("errCard：多条合并为一张，服务名加粗起头、空行分隔，多行错误不被打散", () => {
  const [title, body] = errCard([
    { name: "nginx/a:c-us-01", err: "timeout" },
    { name: "smtp/x:a", err: "line1\nline2" },
    { name: "redis/r:a", err: "new", pre: ["old", TS] },
  ]);
  expect(title).toBe("❌ 3 个服务故障");
  expect(body).toBe(
    "**nginx/a:c-us-01**\ntimeout\n\n" +
      "**smtp/x:a**\nline1\nline2\n\n" +
      "**redis/r:a**\n**错误**：new\n**此前**：old（07-03 18:56 起）",
  );
});

test("recoverCard：单条标题带服务名", () => {
  const li = [{ name: "smtp/x:a", begin: TS, err: "boom" }];
  expect(recoverCard(TS + 60, li, [])).toEqual([
    "✅ smtp/x:a 已恢复",
    "**故障时长**：1 分钟（07-03 18:56 → 07-03 18:57）\n**错误内容**：boom\n\n🎉 全部服务已恢复正常",
  ]);
});

test("recoverCard：多条合并，其余异常只在末尾列一次", () => {
  const [title, body] = recoverCard(
    TS + 300,
    [
      { name: "nginx/a:c-us-01", begin: TS, err: "timeout" },
      { name: "http/b:b.com", begin: TS + 60, err: "" },
    ],
    [["mysql/tidb", "alpha-ai", TS]],
  );
  expect(title).toBe("✅ 2 个服务已恢复");
  expect(body).toBe(
    "**nginx/a:c-us-01**\n**故障时长**：5 分钟（07-03 18:56 → 07-03 19:01）\n**错误内容**：timeout\n\n" +
      "**http/b:b.com**\n**故障时长**：4 分钟（07-03 18:57 → 07-03 19:01）\n\n" +
      "**其余 1 个异常仍在持续**：\n- mysql/tidb · alpha-ai（已持续 5 分钟）",
  );
  expect(
    recoverCard(
      TS + 300,
      [
        { name: "a", begin: TS },
        { name: "b", begin: TS },
      ],
      [],
    )[1],
  ).toEndWith("🎉 全部服务已恢复正常");
});
