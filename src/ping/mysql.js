import { SQL } from "bun";
import raise from "@3-/raise";

// 纯函数（可单测）：Bun 的 MySQLError 措辞可能随版本变化，规整成稳定短文本
// （告警去重靠文本全等，见 errIngNew）：优先错误码，message 只取首行、截 200 字符
export const mysqlErr = (code, message) => {
  const msg = String(message ?? "")
    .split("\n")[0]
    .trim()
    .slice(0, 200);
  return [code, msg].filter(Boolean).join(" ") || "连接失败";
};

// 连上 + SELECT 1 即健康（一次查询完成 TCP+TLS+认证+执行的全链路验证，Bun.SQL 懒连接）。
// TiDB Cloud 强制 TLS，证书为公共 CA（系统根证书可验、SNI 随 hostname 自动携带），
// 必须配网关域名，不能 IP 直连
export default async ({ host, port = 4000, user, password, database, tls = true }) => {
  const sql = new SQL({
    adapter: "mysql",
    hostname: host,
    port,
    username: user,
    password,
    database,
    max: 1,
    // 秒。比框架统一的 30s 超时短，连接挂起时报明确的连接错误而非笼统 timeout
    connectionTimeout: 10,
    tls,
  });
  try {
    await sql`SELECT 1`;
  } catch (err) {
    raise(mysqlErr(err.code, err.message ?? err));
  } finally {
    await sql.close({ timeout: 0 });
  }
};
