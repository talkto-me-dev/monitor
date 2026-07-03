// 纯函数（禁止 import，便于单测）：告警消息文案
// 时间一律东八区展示；正文用飞书 markdown（**加粗**）

const pad = (n) => (n < 10 ? "0" : "") + n;

// 秒 → 人话时长（分钟保留一位小数，与旧文案精度一致）
export const dur = (sec) => {
  sec = +sec;
  if (sec < 60) return sec + " 秒";
  const m = Math.floor(sec / 6) / 10;
  if (m < 99) return m + " 分钟";
  const h = Math.floor(sec / 360) / 10;
  if (h < 48) return h + " 小时";
  return Math.floor(h / 24) + " 天";
};

// 秒时间戳 → "MM-DD HH:mm"（东八区，用 UTC getter 不依赖服务器时区）
export const dt8 = (ts) => {
  const t = new Date((+ts + 8 * 3600) * 1000);
  return (
    pad(t.getUTCMonth() + 1) +
    "-" +
    pad(t.getUTCDate()) +
    " " +
    pad(t.getUTCHours()) +
    ":" +
    pad(t.getUTCMinutes())
  );
};

// 故障通知正文：新故障直接给错误文本；同一落点错误变化时带上旧错误与其起始时间
export const errText = (err, pre) =>
  pre ? "**错误**：" + err + "\n**此前**：" + pre[0] + "（" + dt8(pre[1]) + " 起）" : err;

// 恢复通知正文：故障时段 + 错误内容 + 其余进行中异常明细（remain: [srv名, vps主机名, 起始ts]）
export const recoverText = (now, begin, err, remain) => {
  let txt = "**故障时长**：" + dur(now - begin) + "（" + dt8(begin) + " → " + dt8(now) + "）";
  if (err) {
    txt += "\n**错误内容**：" + err;
  }
  if (!remain.length) {
    return txt + "\n\n🎉 全部服务已恢复正常";
  }
  txt += "\n\n**其余 " + remain.length + " 个异常仍在持续**：";
  for (const [name, vps, ts] of remain.slice(0, 10)) {
    // 落点与服务名重复时（域名/云端实例类监控）不重复展示
    const at = name == vps || name.endsWith("/" + vps) ? "" : " · " + vps;
    txt += "\n- " + name + at + "（已持续 " + dur(now - ts) + "）";
  }
  if (remain.length > 10) {
    txt += "\n- …等共 " + remain.length + " 个";
  }
  return txt;
};
