// 包装定时任务：上一次还没结束就跳过本次（调用 onSkip），保证同一时刻只有一次在跑
export default (fn, onSkip) => {
  let busy = false;
  return async () => {
    if (busy) {
      return onSkip();
    }
    busy = true;
    try {
      return await fn();
    } finally {
      busy = false;
    }
  };
};
