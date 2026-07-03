-- 输出 JSON 统计：{"start":计数起点时间戳,"srv":{"服务名":{"total":n,"500":n,...}}}
-- 鉴权：location 里 set $monitor_token "xxx"，请求需带相同的 x-token 头；
-- 不设 token 则不校验（仅限内网监听时这样用）
local token = ngx.var.monitor_token
if token and token ~= "" and ngx.req.get_headers()["x-token"] ~= token then
  return ngx.exit(ngx.HTTP_FORBIDDEN)
end

local d = ngx.shared.monitor_stat
-- add 只在 key 不存在时写入：reload 后保留、restart 后重建，
-- start 变化即计数器清零信号，监控端据此跳过本轮 delta
d:add("start", ngx.time())
local out = { start = d:get("start"), srv = {} }
for _, key in ipairs(d:get_keys(0)) do
  local name, code = key:match("^(.+):([^:]+)$")
  if name then
    local s = out.srv[name]
    if not s then
      s = {}
      out.srv[name] = s
    end
    s[code] = d:get(key)
  end
end
ngx.header.content_type = "application/json"
ngx.say(require("cjson").encode(out))
