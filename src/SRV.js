import VPS_IP_NAME from "./db/VPS_IP_NAME.js";
import VPS_ID_IP, { vpsEnsure } from "./db/VPS_ID_IP.js";
import VPS_IP from "./db/VPS_IP.js";

// 外部域名探测（uptime 风格）与机器无关，域名本身即落点（自动注册为逻辑节点，
// 状态页胶囊/告警标题直接显示域名）。两种写法：
//   http/api.example.com:                    ← 裸键单域名，tag 即域名，可用率独立一行
//   http/backend: { host: [a.com, b.com] }   ← 分组，每域名独立探测/告警，可用率合并为一行
const domainSrv = (extra) => async (tag, push, args) => {
  for (const host of args?.host ?? [tag]) {
    await vpsEnsure(host);
    push([args?.host && tag, host, host, extra(args)]);
  }
};

export default {
  // 云端数据库（TiDB Cloud 等）与机器无关，tag（无 tag 则网关域名）即落点
  mysql: async (tag, push, args) => {
    const name = tag ?? args.host;
    await vpsEnsure(name);
    push([, name, args]);
  },
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
  http: domainSrv((args) => {
    const { max_ms, path, token } = args ?? {};
    return { max_ms, path, token };
  }),
  ssl: domainSrv((args) => args?.day ?? 14),
};
