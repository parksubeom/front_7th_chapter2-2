// core/context.ts
import { Context } from "./types";

// [Stability] types.ts의 정의에 따라 타입 별칭(alias)을 사용합니다.
type ComponentPath = string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Hook = any; // types.ts의 'type State = any'에 해당

export const context: Context = {
  root: {
    container: null,
    node: null,
    instance: null,
    reset({ container, node }) {
      this.container = container;
      this.node = node;
      this.instance = null;
      context.hooks.clear();
      context.effects.queue = [];
    },
  },
  hooks: {
    state: new Map<ComponentPath, Hook[]>(),
    cursor: new Map<ComponentPath, number>(),
    visited: new Set<ComponentPath>(),
    componentStack: [] as ComponentPath[],
    clear() {
      this.state.clear();
      this.cursor.clear();
      this.visited.clear();
      this.componentStack = [];
    },
    get currentPath(): ComponentPath {
      if (this.componentStack.length === 0) {
        throw new Error("MiniReact: 훅은 함수형 컴포넌트 내부에서만 호출되어야 합니다.");
      }
      return this.componentStack[this.componentStack.length - 1];
    },
    get currentCursor() {
      return this.cursor.get(this.currentPath) || 0;
    },
    get currentHooks(): Hook[] {
      if (!this.state.has(this.currentPath)) {
        this.state.set(this.currentPath, []);
      }
      return this.state.get(this.currentPath)!;
    },
  },
  effects: {
    queue: [],
  },
};

// --- 컨텍스트 헬퍼 함수 ---

export const resetHookContext = (): void => {
  // [FIX] 렌더링 사이클이 시작될 때 커서 맵을 초기화하지 않고,
  // 방문 기록만 초기화하여 각 컴포넌트의 커서 위치를 보존해야 합니다.
  context.hooks.visited.clear();
  context.hooks.componentStack = [];
};

export const getCurrentComponent = (): ComponentPath | null => {
  if (context.hooks.componentStack.length === 0) {
    return null;
  }
  return context.hooks.componentStack[context.hooks.componentStack.length - 1];
};

export const enterComponent = (path: ComponentPath): void => {
  context.hooks.componentStack.push(path);
  context.hooks.visited.add(path);

  // [CRITICAL FIX] 컴포넌트 재진입(리렌더링) 시 반드시 커서를 0으로 리셋해야 합니다.
  // 조건문(!has)을 제거하여 항상 0부터 훅을 시작하도록 보장합니다.
  context.hooks.cursor.set(path, 0);
};

export const exitComponent = (): void => {
  context.hooks.componentStack.pop();
};
