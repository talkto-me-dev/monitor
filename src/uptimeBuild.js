// 纯函数（禁止 import，便于单测）：近 N 天每日可用率
// 入参时间全部为秒；日界按东八区（UTC+8）切分
// 返回 [[名称, 可用率字符串, N 长度日故障秒数数组], ...]，元素 null=无数据 0=正常 >0=当日故障秒数
// （状态页据此按占比渐变上色；旧格式为 0-3 日状态串，monitor-watch 兼容两种）
// 名称重复的 srv_id（如 ipv6_proxy 多主机共用一行 srv）自动去重

const DAY = 86400,
  TZ = 8 * 3600;

export default ({ fixed, ongoing, ctime, names, now, days = 90 }) => {
  const today_start = now - ((now + TZ) % DAY),
    win_start = today_start - (days - 1) * DAY;

  // srv_id → 每日故障秒数
  const down = new Map();
  const add = (srv_id, begin, end) => {
    if (end <= win_start || begin >= now) return;
    begin = Math.max(begin, win_start);
    end = Math.min(end, now);
    let li = down.get(srv_id);
    if (!li) {
      li = new Array(days).fill(0);
      down.set(srv_id, li);
    }
    for (
      let i = Math.floor((begin - win_start) / DAY);
      i * DAY + win_start < end && i < days;
      ++i
    ) {
      const day_begin = win_start + i * DAY;
      li[i] += Math.min(end, day_begin + DAY) - Math.max(begin, day_begin);
    }
  };
  fixed.forEach(([srv_id, begin, duration]) => add(srv_id, +begin, +begin + +duration));
  ongoing.forEach(([srv_id, ts]) => add(srv_id, +ts, now));

  const seen = new Set(),
    rows = [];
  for (const [srv_id, name] of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    const since = +(ctime.get(srv_id) ?? now),
      li = down.get(srv_id),
      day_secs = [];
    let total_down = 0;
    for (let i = 0; i < days; ++i) {
      const day_end = win_start + (i + 1) * DAY;
      if (day_end <= since) {
        day_secs.push(null);
        continue;
      }
      const d = li ? li[i] : 0;
      total_down += d;
      day_secs.push(Math.round(d));
    }
    const observed = now - Math.max(since, win_start),
      pct = observed < 60 ? 100 : (100 * (1 - total_down / observed)).toFixed(2);
    rows.push([name, +pct + "", day_secs]);
  }
  return rows.sort((a, b) => a[0].localeCompare(b[0]));
};
