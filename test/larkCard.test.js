import { test, expect } from "bun:test";
import { card } from "../src/larkCard.js";

test("标题 emoji 决定颜色", () => {
  expect(card("❌ x", "").card.header.template).toBe("red");
  expect(card("✅ 恢复", "").card.header.template).toBe("green");
  expect(card("⚠️ 注意", "").card.header.template).toBe("orange");
  expect(card("普通", "").card.header.template).toBe("blue");
});

test("正文与页脚", () => {
  const c = card("❌ x", "line1\nline2", "📊 [状态页](https://s)");
  expect(c.msg_type).toBe("interactive");
  expect(c.card.elements).toEqual([
    { tag: "markdown", content: "line1\nline2" },
    { tag: "hr" },
    { tag: "note", elements: [{ tag: "lark_md", content: "📊 [状态页](https://s)" }] },
  ]);
});

test("无页脚不加 hr/note", () => {
  const c = card("✅ y", "body");
  expect(c.card.elements.length).toBe(1);
});
