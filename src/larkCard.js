// 飞书 webhook 交互卡片：标题 emoji 决定 header 颜色（❌红 ✅绿 ⚠️橙，默认蓝）

const COLORS = [
  ["❌", "red"],
  ["✅", "green"],
  ["⚠️", "orange"],
];

export const card = (title, body, foot) => {
  const template = (COLORS.find(([e]) => title.includes(e)) || [])[1] || "blue";
  const elements = [{ tag: "markdown", content: body || "" }];
  if (foot) {
    elements.push({ tag: "hr" }, { tag: "note", elements: [{ tag: "lark_md", content: foot }] });
  }
  return {
    msg_type: "interactive",
    card: { header: { title: { tag: "plain_text", content: title }, template }, elements },
  };
};

export default (webhook, foot) => async (title, body) => {
  const r = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card(title, body, foot)),
  });
  if (r.status != 200) {
    throw new Error("lark " + r.status + " " + (await r.text()));
  }
  const j = await r.json();
  if (j.code) {
    throw new Error("lark " + j.code + ": " + j.msg);
  }
};
