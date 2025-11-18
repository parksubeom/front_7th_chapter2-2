export const createObserver = () => {
  const listeners = new Set();
  const subscribe = (fn) => {
    listeners.add(fn);
    console.log("[createObserver] 구독자 추가, 현재 구독자 수:", listeners.size);
  };
  const notify = () => {
    console.log("[createObserver] notify 호출, 구독자 수:", listeners.size);
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
