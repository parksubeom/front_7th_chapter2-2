// core/hooks.ts (v14 - Final useEffect and Cleanup)
import { shallowEquals, withEnqueue } from "../utils";
import { context } from "./context";
import { EffectHook } from "./types";
import { enqueueRender } from "./render";
import { HookTypes } from "./constants";

// [Stability] Local definition for Hook union type
interface StateHook<T> {
  kind: "state";
  value: T;
}
type Hook = StateHook<unknown> | EffectHook;

// --- Effect 큐 및 클린업 로직 ---

/**
 * 예약된 모든 이펙트를 비동기적으로 실행합니다.
 */
const flushEffects = () => {
  const { queue } = context.effects;
  const { state } = context.hooks;

  queue.forEach(({ path, cursor }) => {
    const hook = state.get(path)?.[cursor] as EffectHook | undefined;

    if (!hook || hook.kind !== HookTypes.EFFECT) return;

    // 1. 이전 이펙트의 클린업 함수가 있다면 먼저 실행 (재실행 전 클린업)
    if (hook.cleanup) {
      hook.cleanup();
    }
    // 2. 새 이펙트 실행하고, 새 클린업 함수를 저장
    const newCleanup = hook.effect(); // effectRuns += 1
    hook.cleanup = typeof newCleanup === "function" ? newCleanup : null;
  });
  // 실행된 이펙트는 큐에서 비웁니다.
  queue.length = 0;
};

/**
 * `flushEffects`를 마이크로태스크 큐에 예약합니다.
 */
const enqueueEffects = withEnqueue(flushEffects);

/**
 * [FIX] 특정 컴포넌트 경로(path)에 대한 모든 이펙트 클린업을 실행합니다.
 * (reconciler의 unmount에서 호출됨)
 */

export const cleanupEffects = (_path: string) => {
  const hooks = context.hooks.state.get(_path) as Hook[] | undefined;
  if (hooks) {
    hooks.forEach((hook) => {
      if (hook && hook.kind === HookTypes.EFFECT && hook.cleanup) {
        hook.cleanup(); // 언마운트 시 cleanupCount += 1
      }
    });
  }
};

/**
 * [FIX] 사용되지 않는 컴포넌트의 훅 상태와 이펙트 클린업 함수를 정리합니다.
 * (render 함수의 마지막에 호출되어 메모리 누수를 방지)
 */
export const cleanupUnusedHooks = () => {
  const { state, visited, cursor } = context.hooks;
  state.forEach((hooks, path) => {
    // 1. 이번 렌더링에서 `visited`되지 않았다면 언마운트된 것입니다.
    if (!visited.has(path)) {
      // 2. 이펙트 클린업 실행 (언마운트 클린업)
      cleanupEffects(path);
      // 3. 훅 상태와 커서 정보 삭제 (메모리 정리)
      state.delete(path);
      cursor.delete(path);
    }
  });
};

// --- useState 구현 (이전과 동일) ---
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

// --- useEffect 구현 (완성) ---
export const useEffect = (effect: () => (() => void) | void, deps?: unknown[]): void => {
  const path = context.hooks.currentPath;
  const cursor = context.hooks.currentCursor;
  const hooks = context.hooks.currentHooks as Hook[];
  const oldHook = hooks[cursor] as EffectHook | undefined;

  let shouldRun = false;

  // 1. 의존성 배열 비교
  if (deps === undefined) {
    shouldRun = true;
  } else if (!oldHook) {
    shouldRun = true;
  } else {
    shouldRun = !shallowEquals(oldHook.deps, deps);
  }

  // 2. 새 훅 객체 생성
  const newHook: EffectHook = {
    kind: HookTypes.EFFECT,
    effect,
    deps: deps ?? null,
    cleanup: oldHook?.cleanup ?? null, // 이전 클린업 함수를 보존
  };
  hooks[cursor] = newHook;

  // 3. 실행이 필요하면 큐에 *참조*를 추가하고 스케줄러 호출
  if (shouldRun) {
    context.effects.queue.push({ path, cursor });
    enqueueEffects(); // 비동기 실행 예약
  }

  // 4. 훅 커서를 증가시킵니다.
  context.hooks.cursor.set(path, cursor + 1);
};
