#!/usr/bin/env bun

import binIp from "@3-/ip/binIp.js";
import ipBin from "@3-/ip/ipBin.js";
import VPS_IP from "./VPS_IP.js";
import DB from "../DB.js";

const VPS_ID_IP = new Map(
  (await DB.q("SELECT id,hostname,ip FROM vps")).map(([id, hostname, ip]) => {
    return [hostname, [id, binIp(ip)]];
  }),
);

await (async () => {
  const to_insert = [];
  Object.entries(VPS_IP).forEach(([hostname, ip]) => {
    if (ip.v4 != VPS_ID_IP.get(hostname)) {
      to_insert.push([hostname, ip.v4]);
    }
  });

  if (!to_insert.length) return;

  const rows = to_insert.map(([hostname, ip]) => [hostname, ipBin(ip)]);
  await DB.q(
    "INSERT INTO vps(hostname,ip) VALUES " +
      rows.map((_, i) => `($${i * 2 + 1},$${i * 2 + 2})`) +
      " ON CONFLICT (hostname) DO UPDATE SET ip=EXCLUDED.ip",
    ...rows.flat(),
  );

  const names = to_insert.map(([hostname]) => hostname),
    hostname_id = new Map(
      await DB.q(
        "SELECT hostname,id FROM vps WHERE hostname IN (" +
          names.map((_, i) => "$" + (i + 1)) +
          ")",
        ...names,
      ),
    );
  to_insert.forEach(([hostname, ip]) => {
    VPS_ID_IP.set(hostname, [hostname_id.get(hostname), ip]);
  });
})();

// 逻辑归属节点（如 http/ssl 的默认落点 www）：不在 ip.json（那里只放真实机器），
// 首次引用时以占位 IP 注册进 vps 表，仅作异常记录/展示的挂靠点
export const vpsEnsure = async (hostname, ip = "0.0.0.0") => {
  if (VPS_ID_IP.has(hostname)) return;
  const [[id]] = await DB.q(
    "INSERT INTO vps(hostname,ip) VALUES ($1,$2) ON CONFLICT (hostname) DO UPDATE SET ip=EXCLUDED.ip RETURNING id",
    hostname,
    ipBin(ip),
  );
  VPS_ID_IP.set(hostname, [id, ip]);
};

export default VPS_ID_IP;
