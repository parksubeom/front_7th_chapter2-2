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
  context.hooks.cursor.clear();
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
};

export const exitComponent = (): void => {
  context.hooks.componentStack.pop();
};
