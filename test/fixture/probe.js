// worker.test.js 用的假探测：经 src/var/worker.js 的 "../ping/" + srv 相对路径加载
export default async (mode, ms) => {
  await new Promise((r) => setTimeout(r, ms));
  if (mode == "fail") {
    throw new Error("boom");
  }
  return [[], mode];
};
