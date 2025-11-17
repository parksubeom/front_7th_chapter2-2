// core/hooks.ts
import { shallowEquals, withEnqueue } from "../utils";
import { context } from "./context";
import { EffectHook } from "./types";
import { enqueueRender } from "./render";
import { HookTypes } from "./constants";

interface StateHook<T> {
  kind: "state";
  value: T;
}
type Hook = StateHook<unknown> | EffectHook;

// --- Effect 큐 및 클린업 로직 ---
const flushEffects = () => {
  const { queue } = context.effects;
  const { state } = context.hooks;

  queue.forEach(({ path, cursor }) => {
    const hook = state.get(path)?.[cursor] as EffectHook | undefined;

    if (!hook || hook.kind !== HookTypes.EFFECT) return;

    if (hook.cleanup) hook.cleanup();

    const newCleanup = hook.effect();
    hook.cleanup = typeof newCleanup === "function" ? newCleanup : null;
  });

  queue.length = 0;
};

const enqueueEffects = withEnqueue(flushEffects);

export const cleanupEffects = (path: string) => {
  const hooks = context.hooks.state.get(path) as Hook[] | undefined;
  if (hooks) {
    hooks.forEach((hook) => {
      if (hook && hook.kind === HookTypes.EFFECT && hook.cleanup) {
        hook.cleanup();
      }
    });
  }
};

/**
 * [NEW] 안전하게 컴포넌트 상태 삭제
 * 다른 컴포넌트가 이미 상태를 가져간 경우 삭제하지 않음
 */
export function deleteComponentSafe(path: string) {
  const currentState = context.hooks.state.get(path);
  if (!currentState) return; // 이미 다른 컴포넌트가 가져갔으면 삭제 금지
  context.hooks.state.delete(path);
  context.hooks.cursor.delete(path);
}

/**
 * 기존 deleteComponent (즉시 삭제)
 */
export const deleteComponent = (path: string) => {
  context.hooks.state.delete(path);
  context.hooks.cursor.delete(path);
};

export const cleanupUnusedHooks = () => {
  const { state, visited, cursor } = context.hooks;
  state.forEach((hooks, path) => {
    if (!visited.has(path)) {
      cleanupEffects(path);
      state.delete(path);
      cursor.delete(path);
    }
  });
};

// --- useState 구현 ---
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
    enqueueRender();
  };

  context.hooks.cursor.set(path, cursor + 1);
  return [hook.value as T, setState];
};

// --- useEffect 구현 ---
export const useEffect = (effect: () => (() => void) | void, deps?: unknown[]): void => {
  const path = context.hooks.currentPath;
  const cursor = context.hooks.currentCursor;
  const hooks = context.hooks.currentHooks as Hook[];
  const oldHook = hooks[cursor] as EffectHook | undefined;

  let shouldRun = false;
  if (deps === undefined) {
    shouldRun = true;
  } else if (!oldHook) {
    shouldRun = true;
  } else {
    shouldRun = !shallowEquals(oldHook.deps, deps);
  }

  const newHook: EffectHook = {
    kind: HookTypes.EFFECT,
    effect,
    deps: deps ?? null,
    cleanup: oldHook?.cleanup ?? null,
  };
  hooks[cursor] = newHook;

  if (shouldRun) {
    context.effects.queue.push({ path, cursor });
    enqueueEffects();
  }

  context.hooks.cursor.set(path, cursor + 1);
};
