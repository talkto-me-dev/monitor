import VPS_IP_NAME from "./db/VPS_IP_NAME.js";
import VPS_ID_IP from "./db/VPS_ID_IP.js";
import VPS_IP from "./db/VPS_IP.js";

export default {
  ipv6_proxy: (_tag, push, args) => {
    const { auth, port } = args;
    args.vps.map((vps) => {
      push([, vps, VPS_ID_IP.get(vps)[1], auth, port]);
    });
  },
  redis_sentinel: (tag, push, args) => {
    const { vps } = args;
    args.vps = vps.map((name) => VPS_ID_IP.get(name)[1]);
    push([
      tag,
      vps,
      args,
      // 避免 worker.js 开线程的时候重复取，反复读数据库
      VPS_IP_NAME,
    ]);
  },
  smtp: (tag, push, args) => {
    const { vps } = args;
    args.host = tag;
    args.vps = vps.map((name) => [name, VPS_IP[name]]);
    push([tag, vps, args]);
  },
};
