-- 按 服务名 × 状态码 累计计数（shared dict incr 跨 worker 原子；单调递增，
-- reload 保留、restart 清零——监控端靠 start 标记与计数回退识别）。
-- 服务名默认取 server_name，可在 server{} 里 set $monitor_srv "自定义名" 覆盖。
-- 接入方式见同目录 README.md
local d = ngx.shared.monitor_stat
local srv = ngx.var.monitor_srv
if srv == nil or srv == "" then
  srv = ngx.var.server_name
end
d:incr(srv .. ":total", 1, 0)
local status = tonumber(ngx.var.status)
-- 只记录异常码（4xx/5xx），key 数量有界；监控端只对 5xx 判阈值
if status and status >= 400 then
  d:incr(srv .. ":" .. status, 1, 0)
end
