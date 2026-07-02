import Redis from "@3-/ioredis";
import pair from "@3-/pair";
import raise from "@3-/raise";
// import int from "@3-/int";

const redisGet = async (cluster, conf) => {
  const s = Redis(conf),
    p = s.pipeline();

  cluster.forEach((name) => {
    p.sentinel("slaves", name);
    p.sentinel("sentinels", name);
  });

  p.info("sentinel");
  return (await p.exec()).map(([_, i]) => i);
};

export default async ({ port, password, cluster, vps }, ip_name) => {
  const err_li = [],
    addErr = err_li.push.bind(err_li),
    errIpPortMsg = (ip, port, msg) => {
      addErr(ip_name.get(ip) + " " + ip + ":" + port + " " + msg);
    },
    cluster_slave = new Map(),
    result = await redisGet(cluster, {
      port,
      password,
      host: vps[0],
    });

  const info = result.pop().split("\n");

  pair(result).forEach(([li, sentinels_li], pos) => {
    cluster_slave.set(
      cluster[pos],
      li.map((i) => new Map(pair(i))),
    );
    const sentinels_not_exist = new Set(vps.slice(1));
    sentinels_li.map((i) => {
      const map = new Map(pair(i)),
        ip = map.get("ip"),
        port = map.get("port"),
        flags = map.get("flags");
      if (flags != "sentinel") {
        errIpPortMsg(ip, port, "哨兵异常 : " + flags);
      }
      sentinels_not_exist.delete(ip);
    });
    sentinels_not_exist.forEach((ip) => {
      errIpPortMsg(ip, port, "哨兵挂了");
    });
  });

  cluster = new Set(cluster);

  for (const line of info) {
    if (line.startsWith("master")) {
      const map = new Map(
          line
            .trimEnd()
            .slice(line.indexOf(":") + 1)
            .split(",")
            .map((i) => i.split("=")),
        ),
        name = map.get("name"),
        address = map.get("address"),
        [master_ip, master_port] = address.split(":"),
        status = map.get("status");

      cluster.delete(name);

      if (status != "ok") {
        errIpPortMsg(master_ip, master_port, status);
      }

      const slave_li = cluster_slave.get(name);
      if (!slave_li) {
        addErr(name + " 没有从库");
        continue;
      }

      let slave_li_count = 0;
      slave_li.forEach((map) => {
        const get = map.get.bind(map),
          ip = get("ip"),
          port = get("port"),
          flags = get("flags"),
          mip = get("master-host"),
          mport = get("master-port");

        if (master_ip == ip && master_port == port) {
          return;
        } else if (flags == "slave") {
          if (mip != master_ip || mport != master_port) {
            errIpPortMsg(ip, port, "主库地址 " + mip + ":" + mport + " != " + address);
          } else {
            ++slave_li_count;
          }
        } else {
          errIpPortMsg(ip, port, flags + ` → 主库 ${ip_name.get(mip)} ${mip}:${mport}`);
        }
      });
      if (slave_li_count < 2) {
        errIpPortMsg(master_ip, master_port, "从库数 = " + slave_li_count + " < 2");
      }
    }
  }

  if (cluster.size) {
    addErr("哨兵配置缺少集群: " + [...cluster].join(" & "));
  }
  raise(err_li);
};
