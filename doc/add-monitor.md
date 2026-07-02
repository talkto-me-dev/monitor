# 添加新监控（手把手）

新增一种监控需要动 2~3 个文件：`conf/watch.yml`（声明监控什么）、`src/SRV.js`（把 yml 参数翻译成探测任务）、`src/ping/<srv>.js`（怎么探测）。如果用到新秘密，还要补 `.env` / `.env.example` / `src/loadEnv.js`。

## 数据流（先看懂再动手）

```
conf/watch.yml
  → main.js：每个顶层键 "srv[/tag]" → 自动写 srv 表拿 srv_id → 调 SRV[srv](tag, push, args)
  → SRV.js：把 yml 字段组装成任务，push 一次 = 一条探测任务
  → Watch.js 每 60s：每条任务 → ping()
  → ping.js：Piscina worker 线程执行，30s 超时
  → var/worker.js：import("../ping/" + srv + ".js").default(...args)
```

## 第 1 步：conf/watch.yml 声明监控项

顶层键格式 `srv类型` 或 `srv类型/tag`（tag 用于区分同一类型的不同监控组，如 `smtp/smtp.example.com`）。值是任意参数对象 + `vps` 主机名列表：

```yaml
http/api.example.com:        # srv=http，tag=api.example.com
  port: 8080
  path: /health
  token: ${HTTP_HEALTH_TOKEN} # 秘密一律写 ${VAR} 占位符
  vps:
    - vps-01
    - vps-02
```

规则：

- **秘密（密码/token/auth）绝不写明文**，写 `${VAR}` 占位符，由 `src/loadYml.js` 解析后从环境变量递归注入；对应的键要同时补进 `.env`（真实值）和 `.env.example`（空模板），缺了启动会直接报错
- `vps` 里的主机名必须在 `conf/ip.json` 有对应 IP
- 键名（含 tag）会自动写入 `srv` 表，不用手动建数据

## 第 2 步：src/SRV.js 注册参数翻译逻辑

在 `SRV.js` 的导出对象里加一个与 srv 类型同名的 handler，签名 `(tag, push, args)`：

- `tag`：yml 键里 `/` 后面的部分（没有则 undefined）
- `args`：yml 里这一项的字段对象（占位符已替换成真实值）
- `push(li)`：**调用一次 = 注册一条探测任务**，`li` 的结构是固定契约：

```
push([tag, vps, ...ping_args])
       │    │      └─ 剩余元素按顺序变成 ping 函数的位置参数
       │    └─ 单个主机名字符串，或主机名数组（见下）
       └─ 展示名里的 tag，不需要就留空（写成 [, vps, ...]）
```

`vps` 的两种形态决定告警粒度：

| 形态 | 行为 | 现有例子 |
|---|---|---|
| 单个主机名字符串（每台 push 一次） | 每台独立探测、独立告警/恢复 | `ipv6_proxy` |
| 主机名数组（整组 push 一次） | 整组一次探测，异常挂在 `vps[0]` 名下，展示名用 `&` 连接 | `redis_sentinel`、`smtp` |

两种典型写法（都是真实代码）：

```js
// 每台单独探测：ipv6_proxy → ping 收到 (ip, auth, port)
ipv6_proxy: (_tag, push, args) => {
  const { auth, port } = args;
  args.vps.map((vps) => {
    push([, vps, VPS_ID_IP.get(vps)[1], auth, port]);
  });
},

// 整组一次探测：redis_sentinel → ping 收到 (args, ip_name)
redis_sentinel: (tag, push, args) => {
  const { vps } = args;
  args.vps = vps.map((name) => VPS_ID_IP.get(name)[1]); // 主机名换成 IP
  push([
    tag,
    vps,
    args,
    // 避免 worker.js 开线程的时候重复取，反复读数据库
    VPS_IP_NAME,
  ]);
},
```

注意两点：

- **`...ping_args` 会经 Piscina structured clone 传进 worker 线程**：只能传可克隆的值（对象/数组/Map/字符串/数字都行，函数、类实例不行）
- **worker 里拿不到主线程的内存状态**：ping 函数需要的 DB 派生数据（如 `VPS_ID_IP`、`VPS_IP_NAME`）要在 SRV.js 里预先取好塞进参数，不要让 worker 自己查库

## 第 3 步：src/ping/<srv>.js 实现探测

文件名必须等于 srv 类型名（worker 按 `../ping/<srv>.js` 动态 import）。`export default` 一个 async 函数：

- **成功**：正常返回（返回值不使用）
- **失败**：`throw` 或 `raise(...)`（`@3-/raise`），错误文本就是告警内容——写清楚、可读，相同文本会自动去重（连续同样的错误只告警一次）
- 超时不用自己管：`ping.js` 有统一的 30 秒 AbortController，超时记为 `timeout`
- 需要读 `.env` 的配置（如 API key）可以直接 `import { XXX } from "../env.js"`（worker 线程与主进程共享环境变量），新键记得在 `src/loadEnv.js` 里加校验

示例（配合上面 yml 与 SRV 的 http 例子）：

```js
// src/ping/http.js
import raise from "@3-/raise";

export default async (ip, port, path, token) => {
  const r = await fetch(`http://${ip}:${port}${path}`, {
    headers: { Authorization: "Bearer " + token },
  });
  if (r.status != 200) {
    raise("HTTP " + r.status + " " + (await r.text()).slice(0, 200));
  }
};
```

对应的 SRV.js handler：

```js
http: (_tag, push, args) => {
  const { port, path, token } = args;
  args.vps.map((vps) => {
    push([, vps, VPS_ID_IP.get(vps)[1], port, path, token]);
  });
},
```

## 第 4 步：验证

1. `bun test` —— 确认 yml 占位符、loadEnv 校验没被改坏
2. `./dev.sh` 跑一轮，看日志出现 `✅ http:vps-01` / `❌ ...`（**dev 会真实推送告警**；调试期可以 `LARK=http://127.0.0.1:1/hook ./dev.sh` 让告警发不出去，或起个本地 mock）
3. 确认 DB：`srv` 表自动多了一行（键名），异常时 `errIng` 有记录、恢复后转移到 `errFixed`
4. 故意把端口改错验证一次告警 + 改回来验证恢复通知，再交付

## 检查清单

- [ ] watch.yml 无明文秘密，占位符在 `.env` 和 `.env.example` 都有对应键
- [ ] SRV.js push 的第一个元素是 tag（不需要就留空位）、第二个是 vps（字符串或数组）
- [ ] ping 函数只依赖入参和 env，不查库、不引用主线程状态
- [ ] 错误文本可读（它直接出现在飞书告警里）
- [ ] oxfmt + oxlint 通过
