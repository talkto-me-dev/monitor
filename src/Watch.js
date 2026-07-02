import ping from "./ping.js";
import isoMin from "@3-/time/isoMin.js";
import int from "@3-/int";
import statusWatch from "./statusWatch.js";

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
  await statusWatch(now);
};
