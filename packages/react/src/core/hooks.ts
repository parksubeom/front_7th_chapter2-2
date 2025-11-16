// core/hooks.ts
import { context } from "./context";
import { EffectHook } from "./types";
import { enqueueRender } from "./render";

// [Stability] 'StateHook' 타입을 로컬에 정의
interface StateHook<T> {
  kind: "state";
  value: T;
}
type Hook = StateHook<unknown> | EffectHook;

//const enqueueEffects = withEnqueue(flushEffects);

// [FIX 1] ESLint 'no-unused-vars' 에러 비활성화
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const cleanupEffects = (_path: string) => {};
export const cleanupUnusedHooks = () => {};

// --- useState 구현 (any 제거) ---
export const useState = <T>(initialValue: T | (() => T)): [T, (nextValue: T | ((prev: T) => T)) => void] => {
  const path = context.hooks.currentPath;
  const cursor = context.hooks.currentCursor;
  const hooks = context.hooks.currentHooks as Hook[];

  let hook = hooks[cursor] as StateHook<unknown> | undefined;

  if (!hook) {
    const value = typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
    hook = { kind: "state", value };
    hooks.push(hook);
  }
  // 2. 리렌더링 시 (hook이 있음)
  //    initializer를 "실행하지 않고" 기존 hook.value를 사용합니다.

  const setState = (nextValue: T | ((prev: T) => T)) => {
    const currentHook = context.hooks.state.get(path)![cursor] as StateHook<T>;
    const oldValue = currentHook.value;
    const newValue = typeof nextValue === "function" ? (nextValue as (prev: T) => T)(oldValue) : nextValue;

    if (Object.is(oldValue, newValue)) return;

    currentHook.value = newValue;
    enqueueRender(); // 리렌더링 예약
  };

  context.hooks.cursor.set(path, cursor + 1);
  return [hook.value as T, setState];
};

// --- useEffect 스텁 (훅 순서 유지용) ---
// [FIX 2, 3] ESLint 'no-unused-vars' 에러 비활성화

export const useEffect = (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _effect: () => (() => void) | void,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _deps?: unknown[],
): void => {
  // 훅의 순서를 맞추기 위해 커서만 증가시킵니다.
  const path = context.hooks.currentPath;
  const cursor = context.hooks.currentCursor;
  context.hooks.cursor.set(path, cursor + 1);
};
