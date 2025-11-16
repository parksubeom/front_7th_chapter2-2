// utils/enqueue.ts
import type { AnyFunction } from "../types";

export const enqueue = (callback: () => void) => {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
  } else {
    Promise.resolve()
      .then(callback)
      .catch((err) => {
        console.error(err);
      });
  }
};

export const withEnqueue = (fn: AnyFunction) => {
  let scheduled = false;

  const run = () => {
    try {
      fn();
    } finally {
      scheduled = false;
    }
  };

  return () => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    enqueue(run);
  };
};
