import ping from "./ping.js";
import isoMin from "@3-/time/isoMin.js";
import int from "@3-/int";
import notify from "./notify.js";
import statusWatch from "./statusWatch.js";
import stateSnapshot from "./stateSnapshot.js";

export default async (task) => {
  let now = new Date();
  console.log("→", isoMin(now));
  now = int(now / 1e3);
  // allSettled：单个探测落库出错不影响其余探测的通知
  const settled = await Promise.allSettled(
    [...task].flatMap(([srv, li]) =>
      li.map(([srv_id, tag, vps, ...args]) => ping(now, srv, tag, srv_id, vps, args)),
    ),
  );
  // 探测落库、通知失败汇总到轮末抛出（main 推「监控自身异常」）；快照失败只记日志，都不打断后续步骤
  const fail = settled.filter((r) => r.status == "rejected").map((r) => r.reason.message);
  try {
    await notify(
      now,
      settled.filter((r) => r.value).map((r) => r.value),
    );
  } catch (err) {
    fail.push(err.message);
  }
  try {
    await stateSnapshot(task, now);
  } catch (err) {
    console.error("stateSnapshot", err);
  }
  await statusWatch(now);
  if (fail.length) {
    // DB 抖动时多个探测会报同一条错误，去重后再拼
    throw new Error([...new Set(fail)].join(" | "));
  }
};
