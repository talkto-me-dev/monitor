import raise from "@3-/raise";

// 纯函数（可单测）：状态码非 2xx 或耗时超阈值 → 错误文本数组
// 错误文本按内容去重（errIngNew），故文本必须稳定：
// - 耗时只写阈值不写实测值，连续慢只告警一次
// - HTML body（CF 错误页等，含随机 Ray ID）丢弃只留状态码，非 HTML（如 JSON 错误）保留前 200 字符
export const httpCheck = (status, body, ms, max_ms) => {
  const err_li = [];
  if (status < 200 || status >= 300) {
    body = body.trim();
    if (body.startsWith("<")) {
      body = "";
    }
    err_li.push(("HTTP " + status + " " + body.slice(0, 200)).trim());
  }
  if (ms > max_ms) {
    err_li.push("响应耗时 > " + max_ms + "ms");
  }
  return err_li;
};

export default async (host, max_ms) => {
  const begin = Date.now(),
    r = await fetch("https://" + host),
    ms = Date.now() - begin;
  raise(httpCheck(r.status, r.ok ? "" : await r.text(), ms, max_ms));
};
