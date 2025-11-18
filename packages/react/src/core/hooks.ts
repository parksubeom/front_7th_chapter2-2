// core/hooks.ts
import { shallowEquals, withEnqueue } from "../utils";
import { context } from "./context";
import { EffectHook } from "./types";
import { HookTypes } from "./constants";

// --- 의존성 주입: 렌더링 트리거 함수 ---
let triggerRender: (() => void) | null = null;

export const setRenderTrigger = (fn: () => void): void => {
  triggerRender = fn;
};

interface StateHook<T> {
  kind: "state";
  value: T;
}
type Hook = StateHook<unknown> | EffectHook;

// --- Effect 큐 및 클린업 로직 ---

export const flushEffects = () => {
  const { queue } = context.effects;
  const { state } = context.hooks;

  console.log("[flushEffects] 실행 시작, 큐 크기:", queue.length);
  console.log("[flushEffects] 현재 hooks state:", Array.from(state.keys()));
  queue.forEach(({ path, cursor }) => {
    const hooksForPath = state.get(path);
    const hookAtCursor = hooksForPath?.[cursor];
    console.log("[flushEffects] path에 대한 hooks:", {
      path,
      cursor,
      hooksForPathLength: hooksForPath?.length,
      hookAtCursor,
      hookKind: hookAtCursor?.kind,
    });

    const hook = hookAtCursor as EffectHook | undefined;

    if (!hook || hook.kind !== HookTypes.EFFECT) {
      console.log("[flushEffects] 훅을 찾을 수 없거나 EFFECT가 아님", { path, cursor, hook, hookKind: hook?.kind });
      return;
    }

    console.log("[flushEffects] Effect 실행 시작", {
      path,
      cursor,
      effectFunction: hook.effect.toString().substring(0, 200),
    });
    try {
      if (hook.cleanup) {
        console.log("[flushEffects] cleanup 실행", { path, cursor });
        hook.cleanup();
      }
      console.log("[flushEffects] effect 함수 호출 전", { path, cursor });
      const newCleanup = hook.effect();
      console.log("[flushEffects] effect 함수 호출 후", { path, cursor, hasCleanup: typeof newCleanup === "function" });
      hook.cleanup = typeof newCleanup === "function" ? newCleanup : null;
    } catch (error) {
      console.error("[flushEffects] Effect 실행 중 오류:", error, {
        path,
        cursor,
        errorStack: error instanceof Error ? error.stack : String(error),
      });
      // 에러를 다시 throw하지 않고 계속 진행
      console.warn("[flushEffects] Effect 실행 중 오류가 발생했지만 계속 진행합니다.");
    }
  });
  queue.length = 0;
  console.log("[flushEffects] 실행 완료");

  // [FIX] effects 실행 후 cleanup 수행
  // effects가 실행된 후에 hooks state가 유지된 상태에서 cleanup을 수행합니다.
  cleanupUnusedHooks();
};

export const enqueueEffects = withEnqueue(flushEffects);

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

  let hook = hooks[cursor] as Hook | undefined;

  if (!hook) {
    const value = typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
    hook = { kind: "state", value };
    hooks.push(hook);
  } else if (hook.kind !== "state") {
    const value = typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
    hook = { kind: "state", value };
    hooks[cursor] = hook;
  }

  const setState = (nextValue: T | ((prev: T) => T)) => {
    const currentHook = context.hooks.state.get(path)![cursor] as StateHook<T>;
    const oldValue = currentHook.value;
    const newValue = typeof nextValue === "function" ? (nextValue as (prev: T) => T)(oldValue) : nextValue;

    if (Object.is(oldValue, newValue)) {
      console.log("[useState] setState: 값이 동일하여 리렌더링 스킵", { oldValue, newValue });
      return;
    }

    console.log("[useState] setState: 상태 변경 감지", { path, cursor, oldValue, newValue });
    currentHook.value = newValue;

    // [FIX] 의존성 주입 패턴: 주입받은 렌더링 트리거 함수 호출
    if (triggerRender) {
      console.log("[useState] setState: triggerRender 호출");
      triggerRender();
    } else {
      console.warn(
        "MiniReact: triggerRender가 설정되지 않았습니다. render.ts에서 setRenderTrigger를 호출했는지 확인하세요.",
      );
    }
  };

  context.hooks.cursor.set(path, cursor + 1);
  return [hook.value as T, setState];
};

// --- useEffect ---
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

  console.log("[useEffect] 등록", { path, cursor, shouldRun, deps });

  if (shouldRun) {
    context.effects.queue.push({ path, cursor });
    console.log("[useEffect] 큐에 추가, 큐 크기:", context.effects.queue.length);
    // [FIX] enqueueEffects()는 render() 완료 후에 호출되도록 변경
    // useEffect가 호출되는 시점에는 큐에만 추가하고, render() 완료 후에 실행합니다.
  }

  context.hooks.cursor.set(path, cursor + 1);
};
