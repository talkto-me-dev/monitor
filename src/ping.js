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

const RETRY_DELAY = 5e3;

export default async (now, srv, tag, srv_id, vps, args) => {
  const errmap = ERR.default(srv_id, () => new Map()),
    state = STATE.default(srv_id, () => new Map()),
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

  try {
    let ret;
    try {
      ret = await runProbe();
    } catch (_firstErr) {
      // 网络瞬断：等 5s 重试一次，过滤误报
      log("⟳", srv_name, "retry in 5s");
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
      ret = await runProbe();
    }

    // 只认数组形态，防无状态探测不小心隐式返回值被误解构
    if (Array.isArray(ret)) {
      const [err_li, st] = ret;
      state.set(vps_id, st);
      raise(err_li);
    }
    if (pre_err) {
      errmap.delete(vps_id);
      await recover(now, srv_name, srv_id, vps_id, pre_err);
    } else {
      log("✅", srv_name);
    }
  } catch (err) {
    if (err.name == "AbortError") {
      err = "timeout";
    } else {
      err = err.toString();
      if (err.startsWith("Error: ")) {
        err = err.slice(7);
      }
    }

    await errIngNew(now, errmap, err, srv_name, srv_id, vps_id);
    console.error("❌", srv_name, err);
  }
};
