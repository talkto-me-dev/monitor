import cf from "@3-/doh/cf.js";
import raise from "@3-/raise";
import tlsSmtp from "@3-/tls_smtp";
import dohData from "./dohData.js";

export default async ({ host, user, password, vps }) => {
  const err_li = [],
    ip_li_li = await Promise.all(["A", "AAAA"].map((type) => dohData(cf, host, type))),
    ipCheck = (name, ip, li) => {
      const pos = li.indexOf(ip);
      if (pos < 0) {
        return "域名解析缺失 " + name + " " + ip;
      }
      li.splice(pos, 1);
    },
    smtpCheck = async (name, ip) => {
      try {
        await tlsSmtp(user, password, ip, host);
      } catch (err) {
        return host + " SMTP 异常 : " + name + " " + ip + " " + err;
      }
    };
  for (const [name, { v4, v6 }] of vps) {
    // v4/v6 并发探测，但错误按「机器 → v4 → v6」固定顺序拼接：
    // 按完成先后 push 会让同一故障每轮文本不同，绕过 errIngNew 的文本去重反复告警
    const li = await Promise.all(
      [v4, v6].map(async (ip, pos) => [
        ipCheck(name, ip, ip_li_li[pos]),
        await smtpCheck(name, ip),
      ]),
    );
    err_li.push(...li.flat().filter(Boolean));
  }
  for (const li of ip_li_li) {
    if (li.length) {
      err_li.push("域名" + host + "解析异常（重复指向/未预期的地址) :" + li.join(" / "));
    }
  }

  raise(err_li);
};
