import DB from "./DB.js";
import send from "./send.js";
import { errCard, recoverCard } from "./alertText.js";

// 一轮探测的事件汇总发送：故障一张卡、恢复一张卡（一次后端故障不再刷出几十条消息）。
// 两张卡互不影响；任一失败最后汇总抛出，由 main 推「监控自身异常」，不静默丢通知
export default async (now, events) => {
  const errs = events.filter((e) => !e.ok),
    oks = events.filter((e) => e.ok),
    fail = [],
    step = async (fn) => {
      try {
        await fn();
      } catch (err) {
        fail.push(err.message);
      }
    };
  if (errs.length) {
    await step(() => send(...errCard(errs)));
  }
  if (oks.length) {
    await step(async () => {
      // 列表含已不在监控清单里的遗留记录（便于发现僵尸异常）
      const remain = await DB.q(
        "SELECT s.val,v.hostname,e.ts FROM errIng e JOIN srv s ON s.id=e.srv_id JOIN vps v ON v.id=e.vps_id ORDER BY e.ts",
      );
      await send(...recoverCard(now, oks, remain));
    });
  }
  if (fail.length) {
    throw new Error("通知发送失败：" + fail.join(" | "));
  }
};
