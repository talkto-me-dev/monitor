import THREAD_POOL from "./var/THREAD_POOL.js";
import errIngNew from "./db/errIngNew.js";
import VPS_ID_IP from "./db/VPS_ID_IP.js";
import ERR from "./db/ERR.js";
import log from "@3-/console/log.js";
import recover from "./db/recover.js";

export default async (now, srv, tag, srv_id, vps, args) => {
  const ac = new AbortController(),
    timer = setTimeout(() => {
      ac.abort();
    }, 3e4),
    errmap = ERR.default(srv_id, () => new Map()),
    vps_is_array = Array.isArray(vps);

  const [vps_id] = vps_is_array ? VPS_ID_IP.get(vps[0]) : VPS_ID_IP.get(vps);
  const srv_name = srv + (tag ? "/" + tag : "") + ":" + (vps_is_array ? vps.join("&") : vps);

  const pre_err = errmap.get(vps_id);
  try {
    await THREAD_POOL.run([srv, args], { signal: ac.signal });
    clearTimeout(timer);
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
      clearTimeout(timer);
      err = err.toString();
      if (err.startsWith("Error: ")) {
        err = err.slice(7);
      }
    }

    await errIngNew(now, errmap, err, srv_name, srv_id, vps_id);
    console.error("❌", srv_name, err);
  }
};
