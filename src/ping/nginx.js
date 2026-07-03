import raise from "@3-/raise";

const RE_5XX = /^5\d\d$/;

// 纯函数（可单测）：本轮/上轮计数快照 → [错误文本数组, 新快照]
// 快照结构 {t: 拉取时刻ms, start: nginx 计数起点, srv: {服务名: {total, "500": n, ...}}}
// - 首轮、nginx 重启（start 变化）、计数回退：只存快照不判断
// - 阈值按"每分钟增量"折算（上一轮失败会拉长间隔，避免跨多轮累计误报）
// - 错误文本只含服务名与阈值（不含实测值，连续超标只告警一次，见 errIngNew）
export const nginxCheck = (cur, prev, max_5xx) => {
  if (!prev || prev.start != cur.start) {
    return [[], cur];
  }
  const min = Math.max(1, (cur.t - prev.t) / 6e4),
    err_li = [];
  for (const [name, st] of Object.entries(cur.srv ?? {})) {
    const pre = (prev.srv ?? {})[name];
    if (!pre) continue; // 新出现的服务，下一轮才有基线
    let n = 0;
    for (const [code, val] of Object.entries(st)) {
      const delta = val - (pre[code] ?? 0);
      if (delta < 0) {
        return [[], cur]; // start 未变但计数回退（异常情况），当重置处理
      }
      if (RE_5XX.test(code)) {
        n += delta;
      }
    }
    if (n / min >= max_5xx) {
      err_li.push(name + " 5xx ≥ " + max_5xx + "/分钟");
    }
  }
  return [err_li, cur];
};

export default async (ip, { port = 80, path = "/monitor-stat", token, max_5xx = 3 }, prev) => {
  const r = await fetch("http://" + ip + ":" + port + path, {
    headers: token ? { "x-token": token } : undefined,
  });
  if (!r.ok) {
    raise("统计端点 HTTP " + r.status);
  }
  let cur;
  try {
    cur = await r.json();
  } catch {
    // SyntaxError 会带 body 片段（可能含波动内容破坏去重），换成稳定文本
    raise("统计端点返回非 JSON");
  }
  return nginxCheck({ t: Date.now(), ...cur }, prev, max_5xx);
};
