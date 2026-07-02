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
        err_li.push("域名解析缺失 " + name + " " + ip);
      } else {
        li.splice(pos, 1);
      }
    };
  for (const [name, { v4, v6 }] of vps) {
    await Promise.all(
      [v4, v6].map(async (ip, pos) =>
        Promise.all([
          ipCheck(name, ip, ip_li_li[pos]),

          (async () => {
            try {
              await tlsSmtp(user, password, ip, host);
            } catch (err) {
              err_li.push(host + " SMTP 异常 : " + name + " " + ip + " " + err);
            }
          })(),
        ]),
      ),
    );
  }
  for (const li of ip_li_li) {
    if (li.length) {
      err_li.push("域名" + host + "解析异常（重复指向/未预期的地址) :" + li.join(" / "));
    }
  }

  raise(err_li);
};
