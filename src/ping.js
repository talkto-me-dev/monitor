import THREAD_POOL from "./var/THREAD_POOL.js";
import errIngNew from "./db/errIngNew.js";
import VPS_ID_IP from "./db/VPS_ID_IP.js";
import ERR from "./db/ERR.js";
import log from "@3-/console/log.js";
import raise from "@3-/raise";
import recover from "./db/recover.js";

// 跨轮状态通道：srv_id → (vps_id → 上一轮探测返回的 state)
// 有状态探测（delta 型，如 nginx 计数器）不 throw，返回 [err_li, state]：
// state 先存再 raise，保证告警轮基线也前移；下一轮作为末位参数回传给 ping 函数。
// 无状态探测无返回值、失败直接 throw，不受影响（末位多收到一个 undefined）。
const STATE = new Map();

// 待确认故障：srv_id → (vps_id → 首次失败 ts)。新故障要连续两轮失败才告警，过滤分钟级网络抖动
const PENDING = new Map();

const RETRY_DELAY = 5e3;

// 返回本轮要通知的事件（由 Watch 汇总成一张卡片发送），无事件返回 undefined
export default async (now, srv, tag, srv_id, vps, args) => {
  const errmap = ERR.default(srv_id, () => new Map()),
    state = STATE.default(srv_id, () => new Map()),
    pending = PENDING.default(srv_id, () => new Map()),
    vps_is_array = Array.isArray(vps);

  const [vps_id] = vps_is_array ? VPS_ID_IP.get(vps[0]) : VPS_ID_IP.get(vps);
  const srv_name = srv + (tag ? "/" + tag : "") + ":" + (vps_is_array ? vps.join("&") : vps);

  const pre_err = errmap.get(vps_id);

  // 网络层/worker 层探测，失败直接 throw
  const runProbe = async () => {
    const ac = new AbortController(),
      timer = setTimeout(() => {
        ac.abort();
      }, 3e4);
    try {
      const ret = await THREAD_POOL.run([srv, [...args, state.get(vps_id)]], { signal: ac.signal });
      clearTimeout(timer);
      return ret;
    } catch (err) {
      if (err.name !== "AbortError") clearTimeout(timer);
      throw err;
    }
  };

  // 有状态探测的业务告警（如每分钟 5xx 增量）本身就是单轮窗口事件，不做两轮确认
  let stateful_err = false,
    err;
  try {
    let ret;
    try {
      ret = await runProbe();
    } catch {
      // 网络瞬断：等 5s 重试一次，过滤误报
      log("⟳", srv_name, "retry in 5s");
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
      ret = await runProbe();
    }

    // 只认数组形态，防无状态探测不小心隐式返回值被误解构
    if (Array.isArray(ret)) {
      const [err_li, st] = ret;
      state.set(vps_id, st);
      stateful_err = !!err_li?.length;
      raise(err_li);
    }
  } catch (e) {
    err = e.name == "AbortError" ? "timeout" : String(e).replace(/^Error: /, "");
  }

  // 以下内存状态都在落库成功后才清：落库失败时 ping 抛错，下一轮按原状态重试（SQL 幂等）
  if (err === undefined) {
    pending.delete(vps_id);
    if (pre_err) {
      const ev = await recover(now, srv_name, srv_id, vps_id, pre_err);
      errmap.delete(vps_id);
      return ev;
    }
    log("✅", srv_name);
    return;
  }

  let begin = now;
  if (!pre_err && !stateful_err) {
    if (!pending.has(vps_id)) {
      pending.set(vps_id, now);
      log("⏳", srv_name, err, "（待下一轮确认）");
      return;
    }
    begin = pending.get(vps_id);
  }
  console.error("❌", srv_name, err);
  const ev = await errIngNew(now, begin, errmap, err, srv_name, srv_id, vps_id);
  pending.delete(vps_id);
  return ev;
};
