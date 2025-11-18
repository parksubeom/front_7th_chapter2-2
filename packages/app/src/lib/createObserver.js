export const createObserver = () => {
  const listeners = new Set();
  const subscribe = (fn) => {
    listeners.add(fn);
  };
  const notify = () => {
    listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error("[createObserver] 구독자 실행 중 오류:", error);
      }
    });
  };

  return { subscribe, notify };
};
