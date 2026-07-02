// 纯函数（禁止 import，便于单测）：由 TASK + ERR + VPS_ID_IP + OK_SINCE 生成全量状态快照
// err 项：[srv, tag, vps, 起始ts秒, 错误文本]；ok 项：[srv, tag, vps, 上次异常结束ts秒|null]
export default (task, err, vpsIdIp, okSince, now) => {
  const state = { ts: now, err: [], ok: [] };
  for (const [srv, li] of task) {
    for (const [srv_id, tag, vps] of li) {
      // vps 为数组时与 ping.js 一致：取 vps[0] 对应的 id
      const [vps_id] = vpsIdIp.get(Array.isArray(vps) ? vps[0] : vps);
      const e = err.get(srv_id)?.get(vps_id);
      if (e) {
        // e[1] 启动时来自 DB（bigint 字符串）、运行期是数字，统一转数字保证快照契约稳定
        state.err.push([srv, tag ?? "", vps, +e[1], e[0]]);
      } else {
        state.ok.push([srv, tag ?? "", vps, okSince.get(srv_id + ":" + vps_id) ?? null]);
      }
    }
  }
  return state;
};
