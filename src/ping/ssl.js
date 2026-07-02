import tls from "node:tls";
import { lookup } from "node:dns/promises";
import raise from "@3-/raise";

// 纯函数（可单测）：证书剩余天数 < day → 错误文本数组
// 剩余天数逐日递减，文本每天变一次 → 每天重新提醒一次直到续期
export const sslCheck = (valid_to, day, now) => {
  const left = Math.floor((new Date(valid_to) - now) / 864e5);
  if (Number.isNaN(left)) {
    return ["SSL 证书过期时间无法解析: " + valid_to];
  }
  if (left < day) {
    return ["SSL 证书剩余 " + left + " 天（" + valid_to + " 过期）"];
  }
  return [];
};

// 握手失败（已过期/证书链不完整/SNI 不匹配）会走 error 直接告警。
// 先解析 IP 再按 IP 连接：Bun 的 node:tls 按域名连接 CNAME 链（如阿里云 ALB）时
// 会用 CNAME 目标当 SNI 拿到错误证书；按 IP 连接则以 servername 握手并校验。
// 握手后再显式校验一次证书与域名匹配，双保险。
export default async (host, day) => {
  const { address } = await lookup(host, { family: 4 });
  const cert = await new Promise((resolve, reject) => {
    const socket = tls.connect({ port: 443, host: address, servername: host }, () => {
      resolve(socket.getPeerCertificate());
      socket.end();
    });
    socket.on("error", reject);
  });
  const id_err = tls.checkServerIdentity(host, cert);
  if (id_err) {
    raise("SSL 证书域名不匹配: " + id_err.message);
  }
  raise(sslCheck(cert.valid_to, day, Date.now()));
};
