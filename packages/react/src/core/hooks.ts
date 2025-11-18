// core/hooks.ts
import { shallowEquals, withEnqueue } from "../utils";
import { context } from "./context";
import { EffectHook } from "./types";
import { HookTypes } from "./constants";

interface StateHook<T> {
  kind: "state";
  value: T;
}
interface RefHook<T> {
  kind: "ref";
  value: { current: T };
}
type Hook = StateHook<unknown> | EffectHook | RefHook<unknown>;

// --- 렌더링 트리거 ---
let triggerRender = () => console.error("❌ [hooks] Trigger not ready!");

export const setRenderTrigger = (trigger: () => void) => {
  console.log("✅ [hooks] setRenderTrigger: Connected.");
  triggerRender = trigger;
};

// --- Effect Logic ---
const flushEffects = () => {
  const { queue } = context.effects;
  const { state } = context.hooks;

  queue.forEach(({ path, cursor }) => {
    const hooks = state.get(path);
    if (!hooks) return;

    const hook = hooks[cursor] as EffectHook | undefined;
    if (!hook || hook.kind !== HookTypes.EFFECT) return;

    try {
      // 1. 이전 cleanup 실행
      if (hook.cleanup) {
        hook.cleanup();
      }
      // 2. effect 실행
      const newCleanup = hook.effect();
      hook.cleanup = typeof newCleanup === "function" ? newCleanup : null;
    } catch (error) {
      // effect 실행 중 예외가 나도 앱이 죽지 않도록 로그만 출력
      console.error(`❌ [CRITICAL EFFECT CRASH] path=${path} cursor=${cursor}`, error);
      hook.cleanup = null;
    }
  });

  queue.length = 0;
};

const enqueueEffects = withEnqueue(flushEffects);
export { enqueueEffects };

export const cleanupEffects = (path: string) => {
  const hooks = context.hooks.state.get(path) as Hook[] | undefined;
  if (hooks) {
    hooks.forEach((hook) => {
      if (hook && hook.kind === HookTypes.EFFECT && hook.cleanup) hook.cleanup();
    });
  }
};

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

// --- useState ---
export const useState = <T>(initialValue: T | (() => T)): [T, (nextValue: T | ((prev: T) => T)) => void] => {
  const path = context.hooks.currentPath;
  const cursor = context.hooks.currentCursor;
  const hooks = context.hooks.currentHooks as Hook[];
  let hook = hooks[cursor] as StateHook<unknown> | undefined;

  if (!hook) {
    const value = typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
    hook = { kind: "state", value };
    hooks.push(hook);
  } else if (hook.kind !== "state") {
    const value = typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
    hook = { kind: "state", value };
    hooks[cursor] = hook;
  }

  const currentHook = hook;

  const setState = (nextValue: T | ((prev: T) => T)) => {
    const oldValue = currentHook.value as T;
    const newValue = typeof nextValue === "function" ? (nextValue as (prev: T) => T)(oldValue) : nextValue;
    if (Object.is(oldValue, newValue)) return;

    currentHook.value = newValue;
    console.log(`🔄 [useState] setState called at ${path}. Triggering render...`);
    triggerRender();
  };

  context.hooks.cursor.set(path, cursor + 1);
  return [currentHook.value as T, setState];
};

// --- useEffect ---
export const useEffect = (effect: () => void | (() => void), deps?: unknown[]): void => {
  const path = context.hooks.currentPath;
  const cursor = context.hooks.currentCursor;
  const hooks = context.hooks.currentHooks as Hook[];
  const oldHook = hooks[cursor] as EffectHook | undefined;

  let shouldRun = false;

  if (deps === undefined) {
    shouldRun = true;
  } else if (!oldHook) {
    shouldRun = true;
  } else if (!shallowEquals(oldHook.deps, deps)) {
    shouldRun = true;
  }

  const newHook: EffectHook = {
    kind: HookTypes.EFFECT,
    effect,
    deps,
    cleanup: oldHook?.cleanup ?? null,
  };

  hooks[cursor] = newHook;

  if (shouldRun) {
    context.effects.queue.push({ path, cursor });
  }

  context.hooks.cursor.set(path, cursor + 1);
};

// --- useRef ---
export const useRef = <T>(initialValue: T): { current: T } => {
  const path = context.hooks.currentPath;
  const cursor = context.hooks.currentCursor;
  const hooks = context.hooks.currentHooks as Hook[];
  let hook = hooks[cursor] as RefHook<T> | undefined;

  if (!hook || hook.kind !== "ref") {
    const value = { current: initialValue };
    hook = { kind: "ref", value };
    hooks.push(hook);
  }

  context.hooks.cursor.set(path, cursor + 1);
  return hook.value;
};
