// core/reconciler.ts
import { context, enterComponent, exitComponent } from "./context";
import { Fragment, NodeTypes, TEXT_ELEMENT, NodeType } from "./constants";
import { Instance, VNode } from "./types";
import { getFirstDom, insertInstance, removeInstance, setDomProps, updateDomProps } from "./dom";
import { createChildPath } from "./elements";
import { cleanupEffects, deleteComponent } from "./hooks";

// [Advanced] Memoized 컴포넌트 타입 정의 (HOC 최적화용)
type MemoizedComponentType = React.ComponentType & {
  __memoConfig?: {
    equals: (prevProps: Record<string, unknown>, nextProps: Record<string, unknown>) => boolean;
    render: React.ComponentType;
  };
};

/**
 * 주어진 노드부터 시작하여 실제 DOM에 삽입할 수 있는 유효한 형제 노드(Anchor)를 찾습니다.
 * (주석 노드나 빈 텍스트 노드 등을 건너뛰고 실제 Element나 Text를 찾음)
 */
function getNextUsableAnchor(node: Node | null): HTMLElement | Text | null {
  if (node === null) return null;
  if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
    return node as HTMLElement | Text;
  }
  return getNextUsableAnchor(node.nextSibling);
}

function getNodeType(type: VNode["type"]): NodeType {
  if (typeof type === "string") return NodeTypes.HOST;
  if (type === TEXT_ELEMENT) return NodeTypes.TEXT;
  if (type === Fragment) return NodeTypes.FRAGMENT;
  if (typeof type === "function") return NodeTypes.COMPONENT;
  throw new Error(`Unknown VNode type: ${String(type)}`);
}

// --- Mount / Update 통합 ---

/**
 * 컴포넌트 자식의 고정된 경로 접미사를 반환합니다.
 */
const getComponentChildPath = (parentPath: string): string => {
  return `${parentPath}.c0`;
};

/**
 * 함수형 컴포넌트를 최초 렌더링(Mount)합니다.
 *
 * 1. Hooks 컨텍스트 진입 (enterComponent)
 * 2. memo 설정 확인 및 렌더 함수 결정
 * 3. 컴포넌트 실행 및 자식 VNode 생성
 * 4. Hooks 컨텍스트 이탈 (exitComponent)
 * 5. 자식 재귀적 마운트
 */
function mountComponent(
  parentDom: HTMLElement,
  node: VNode,
  path: string,
  anchor: HTMLElement | Text | null,
): Instance {
  enterComponent(path);
  const Component = node.type as MemoizedComponentType;
  const memoConfig = Component.__memoConfig;
  const renderFn = (memoConfig?.render as React.ComponentType) ?? Component;
  const childNode = renderFn(node.props);
  exitComponent();

  const instance: Instance = {
    node,
    dom: null,
    children: [],
    path,
    kind: NodeTypes.COMPONENT,
    key: node.key,
    memoizedProps: memoConfig ? (node.props as Record<string, unknown>) : null,
  };

  const childPath = getComponentChildPath(path);
  const childInstance = reconcile(parentDom, null, childNode, childPath, anchor);
  instance.children = [childInstance];
  instance.dom = getFirstDom(childInstance);
  return instance;
}

/**
 * 일반 DOM 요소(div, span 등)를 마운트합니다.
 */
function mountHost(parentDom: HTMLElement, node: VNode, path: string, anchor: HTMLElement | Text | null): Instance {
  let dom: HTMLElement | Text;
  if (node.type === TEXT_ELEMENT) {
    dom = document.createTextNode(node.props.nodeValue as string);
  } else {
    dom = document.createElement(node.type as string);
    setDomProps(dom as HTMLElement, node.props);
  }
  const instance: Instance = {
    node,
    dom,
    children: [],
    path,
    kind: getNodeType(node.type),
    key: node.key,
  };
  instance.children = reconcileChildren(dom as HTMLElement, instance, node.props.children || [], path, null);
  insertInstance(parentDom, instance, anchor);
  return instance;
}

/**
 * Fragment를 마운트합니다.
 */
function mountFragment(parentDom: HTMLElement, node: VNode, path: string, anchor: HTMLElement | Text | null): Instance {
  const instance: Instance = {
    node,
    dom: null,
    children: [],
    path,
    kind: NodeTypes.FRAGMENT,
    key: node.key,
  };
  instance.children = reconcileChildren(parentDom, instance, node.props.children || [], path, anchor);
  return instance;
}

/**
 * VNode 타입에 따라 적절한 Mount 함수를 라우팅합니다.
 */
function mount(parentDom: HTMLElement, node: VNode, path: string, anchor: HTMLElement | Text | null): Instance {
  const nodeType = getNodeType(node.type);
  switch (nodeType) {
    case NodeTypes.COMPONENT:
      return mountComponent(parentDom, node, path, anchor);
    case NodeTypes.HOST:
    case NodeTypes.TEXT:
      return mountHost(parentDom, node, path, anchor);
    case NodeTypes.FRAGMENT:
      return mountFragment(parentDom, node, path, anchor);
    default:
      throw new Error("Unknown node type during mount");
  }
}

/**
 * 컴포넌트를 업데이트합니다.
 * [Optimization] memo HOC가 적용된 경우 props 비교를 통해 렌더링을 건너뜁니다 (Bailout).
 */
function updateComponent(
  parentDom: HTMLElement,
  instance: Instance,
  node: VNode,
  path: string,
  anchor: HTMLElement | Text | null,
): Instance {
  enterComponent(path);
  const Component = node.type as MemoizedComponentType;
  const memoConfig = Component.__memoConfig;

  // [Bailout Check] 이전 props와 새 props가 같다면 재사용
  if (
    memoConfig &&
    instance.memoizedProps &&
    memoConfig.equals(instance.memoizedProps, node.props as Record<string, unknown>)
  ) {
    instance.node = node;
    exitComponent();
    return instance;
  }

  const renderFn = (memoConfig?.render as React.ComponentType) ?? Component;
  const childNode = renderFn(node.props);
  exitComponent();

  const childPath = getComponentChildPath(path);
  const oldChildInstance = instance.children[0];
  const newChildInstance = reconcile(parentDom, oldChildInstance, childNode, childPath, anchor);

  instance.children = [newChildInstance];
  instance.dom = getFirstDom(newChildInstance);
  instance.memoizedProps = memoConfig ? (node.props as Record<string, unknown>) : null;
  return instance;
}

function updateHost(parentDom: HTMLElement, instance: Instance, node: VNode, path: string): Instance {
  updateDomProps(instance.dom!, instance.node.props, node.props);
  instance.node = node;
  instance.children = reconcileChildren(instance.dom as HTMLElement, instance, node.props.children || [], path, null);
  return instance;
}

function updateFragment(parentDom: HTMLElement, instance: Instance, node: VNode, path: string): Instance {
  instance.node = node;
  const startAnchor = getFirstDom(instance) || null;
  instance.children = reconcileChildren(parentDom, instance, node.props.children || [], path, startAnchor);
  return instance;
}

// --- Unmount ---

/**
 * 인스턴스를 제거하고 Hook 상태를 정리합니다.
 *
 * @param skipStateDelete - true일 경우 DOM만 제거하고 Hook 상태(메모리)는 유지합니다.
 * (다른 컴포넌트가 해당 경로로 이동하여 상태를 이어받아야 할 때 사용됨 - Collision Guard)
 */
function unmount(parentDom: HTMLElement, instance: Instance | null, skipStateDelete = false): void {
  if (!instance) return;
  removeInstance(parentDom, instance);
  cleanupEffects(instance.path);

  if (!skipStateDelete) {
    deleteComponent(instance.path);
  }

  if (instance.children) {
    instance.children.forEach((child) => unmount(parentDom, child, skipStateDelete));
  }
}

// --- Reconcile Children (Core Logic) ---

type HookBucket = {
  hooks: unknown[];
  cursor?: number;
};

/**
 * 자식 리스트를 비교하고 업데이트하는 핵심 알고리즘입니다.
 *
 * 1. Key 기반 매칭 (재사용성 극대화)
 * 2. 선제적 퇴거 (Pre-emptive Eviction): 새 컴포넌트가 입주할 자리에 있는 기존 컴포넌트의 상태를 대피시킴
 * 3. 상태 이동 (State Transfer): 컴포넌트가 이동하면 상태도 따라 이동
 * 4. 충돌 방지 (Collision Guard): 삭제될 컴포넌트가 새 주인의 상태를 지우지 않도록 보호
 */
function reconcileChildren(
  parentDom: HTMLElement,
  instance: Instance,
  children: VNode[],
  path: string,
  startAnchor: HTMLElement | Text | null,
): (Instance | null)[] {
  const oldChildren = instance.children || [];
  const newInstances: (Instance | null)[] = new Array(children.length).fill(null);

  const keyedOldMap = new Map<string, Instance>();
  const unkeyedOldList: Instance[] = [];
  const pathToOldInstance = new Map<string, Instance>();

  // 임시 상태 보관소 (Eviction용)
  const orphanedHooks = new Map<string, HookBucket>();

  // --- Helper: 상태 대피 (Eviction) ---
  const stashHookBucket = (targetPath: string) => {
    const hooks = context.hooks.state.get(targetPath);
    const cursor = context.hooks.cursor.get(targetPath);
    if (!hooks && cursor === undefined) {
      return;
    }
    orphanedHooks.set(targetPath, {
      hooks: hooks ?? [],
      cursor,
    });
    context.hooks.state.delete(targetPath);
    if (cursor !== undefined) {
      context.hooks.cursor.delete(targetPath);
    }
  };

  // --- Helper: 상태 복구 (Restoration) ---
  const takeHookBucket = (targetPath: string): HookBucket | undefined => {
    const cached = orphanedHooks.get(targetPath);
    if (cached) {
      orphanedHooks.delete(targetPath);
      return cached;
    }

    const hooks = context.hooks.state.get(targetPath);
    const cursor = context.hooks.cursor.get(targetPath);
    if (hooks || cursor !== undefined) {
      context.hooks.state.delete(targetPath);
      if (cursor !== undefined) {
        context.hooks.cursor.delete(targetPath);
      }
      return {
        hooks: hooks ?? [],
        cursor,
      };
    }
    return undefined;
  };

  // 1. Old Children 분류
  for (const oldChild of oldChildren) {
    if (!oldChild) continue;
    if (oldChild.key !== null) {
      keyedOldMap.set(oldChild.key, oldChild);
    } else {
      unkeyedOldList.push(oldChild);
    }
    pathToOldInstance.set(oldChild.path, oldChild);
  }

  let lastPlacedDom: Node | null = null;

  // 2. New Children 순회
  for (let i = 0; i < children.length; i++) {
    const newVNode = children[i];
    if (!newVNode) continue;

    let oldInstance: Instance | undefined;

    // A. 매칭 (Match Finding)
    if (newVNode.key !== null) {
      oldInstance = keyedOldMap.get(newVNode.key);
      if (oldInstance) keyedOldMap.delete(newVNode.key);
    } else {
      const matchIndex = unkeyedOldList.findIndex((old) => old.node.type === newVNode.type);
      if (matchIndex !== -1) {
        oldInstance = unkeyedOldList[matchIndex];
        unkeyedOldList.splice(matchIndex, 1);
      }
    }

    const childPath = createChildPath(path, newVNode.key ?? null, i);

    // B. [Pre-emptive Eviction] 내가 가려는 경로에 이미 다른 인스턴스가 살고 있다면?
    // 그 인스턴스(ownerOfPath)가 '나'가 아니라면, 그 녀석의 짐을 미리 치워줍니다.
    const ownerOfPath = pathToOldInstance.get(childPath);
    if (ownerOfPath && ownerOfPath !== oldInstance) {
      stashHookBucket(childPath);
    }

    // C. Anchor 계산
    const effectiveAnchorSource = lastPlacedDom ? lastPlacedDom.nextSibling : startAnchor;
    const anchor = getNextUsableAnchor(effectiveAnchorSource);

    // D. State Transfer (이사)
    if (oldInstance && oldInstance.path !== childPath) {
      const preserved = takeHookBucket(oldInstance.path);
      if (preserved?.hooks) {
        context.hooks.state.set(childPath, preserved.hooks);
      }
      if (preserved && preserved.cursor !== undefined) {
        context.hooks.cursor.set(childPath, preserved.cursor);
      }
      oldInstance.path = childPath;
    }

    // E. 재귀적 재조정
    const newInstance = reconcile(parentDom, oldInstance || null, newVNode, childPath, anchor);

    if (newInstance) {
      newInstances[i] = newInstance;
      const newDom = getFirstDom(newInstance);
      if (newDom) {
        // F. DOM 위치 조정
        if (!oldInstance || newDom.previousSibling !== lastPlacedDom) {
          insertInstance(parentDom, newInstance, anchor);
        }
        lastPlacedDom = newDom;
      }
    }
  }

  // 3. 삭제 처리 (Cleanup with Collision Guard)
  const activePaths = new Set(newInstances.map((i) => i?.path));

  unkeyedOldList.forEach((oldChild) => {
    // 삭제될 녀석의 경로를 누군가(새 주인)가 쓰고 있다면, 상태 삭제를 건너뜁니다.
    const shouldSkipDelete = activePaths.has(oldChild.path);
    unmount(parentDom, oldChild, shouldSkipDelete);
  });

  keyedOldMap.forEach((child) => unmount(parentDom, child));

  return newInstances;
}

// --- Main Reconcile ---
export function reconcile(
  parentDom: HTMLElement,
  instance: Instance | null,
  node: VNode | null,
  path: string,
  _anchor: HTMLElement | Text | null = null,
): Instance | null {
  if (node == null || typeof node !== "object" || !("type" in node)) {
    unmount(parentDom, instance);
    return null;
  }
  if (instance === null) {
    return mount(parentDom, node, path, _anchor);
  }
  if (instance.key !== node.key || instance.node.type !== node.type) {
    unmount(parentDom, instance);
    return mount(parentDom, node, path, _anchor);
  }

  const nodeType = getNodeType(node.type);
  switch (nodeType) {
    case NodeTypes.COMPONENT:
      return updateComponent(parentDom, instance, node, path, _anchor);
    case NodeTypes.HOST:
    case NodeTypes.TEXT:
      return updateHost(parentDom, instance, node, path);
    case NodeTypes.FRAGMENT:
      return updateFragment(parentDom, instance, node, path);
    default:
      throw new Error("Unknown node type during update");
  }
}
