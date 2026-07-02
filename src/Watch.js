import ping from "./ping.js";
import isoMin from "@3-/time/isoMin.js";
import int from "@3-/int";
import statusWatch from "./statusWatch.js";
import stateSnapshot from "./stateSnapshot.js";

export default async (task) => {
  let now = new Date();
  console.log("→", isoMin(now));
  now = int(now / 1e3);
  await Promise.all(
    task
      .entries()
      .map(async ([srv, li]) =>
        Promise.all(
          li.map(([srv_id, tag, vps, ...args]) => ping(now, srv, tag, srv_id, vps, args)),
        ),
      ),
  );
  // 快照失败不影响主流程
  try {
    await stateSnapshot(task, now);
  } catch (err) {
    console.error("stateSnapshot", err);
  }
  await statusWatch(now);
};
