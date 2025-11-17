// core/reconciler.ts (v21 - Explicit Skip Delete)
import { context, enterComponent, exitComponent } from "./context";
import { Fragment, NodeTypes, TEXT_ELEMENT, NodeType } from "./constants";
import { Instance, VNode } from "./types";
import { getFirstDom, insertInstance, removeInstance, setDomProps, updateDomProps } from "./dom";
import { createChildPath } from "./elements";
import { cleanupEffects, deleteComponent } from "./hooks";

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

// --- Mount / Update (이전과 동일) ---

function mountComponent(
  parentDom: HTMLElement,
  node: VNode,
  path: string,
  anchor: HTMLElement | Text | null,
): Instance {
  enterComponent(path);
  const Component = node.type as React.ComponentType;
  const childNode = Component(node.props);
  exitComponent();

  const instance: Instance = {
    node,
    dom: null,
    children: [],
    path,
    kind: NodeTypes.COMPONENT,
    key: node.key,
  };

  const childInstance = reconcile(parentDom, null, childNode, path, anchor);
  instance.children = [childInstance];
  instance.dom = getFirstDom(childInstance);
  return instance;
}

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

function updateComponent(
  parentDom: HTMLElement,
  instance: Instance,
  node: VNode,
  path: string,
  anchor: HTMLElement | Text | null,
): Instance {
  enterComponent(path);
  const Component = node.type as React.ComponentType;
  const childNode = Component(node.props);
  exitComponent();

  const oldChildInstance = instance.children[0];
  const newChildInstance = reconcile(parentDom, oldChildInstance, childNode, path, anchor);

  instance.node = node;
  instance.children = [newChildInstance];
  instance.dom = getFirstDom(newChildInstance);
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

// --- Unmount (수정됨) ---

/**
 * [FIX] skipStateDelete 옵션 추가
 * true일 경우 DOM만 제거하고 Hook 상태는 유지합니다. (다른 컴포넌트가 그 자리를 차지했을 때 사용)
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

// --- Reconcile Children (With Explicit Collision Guard) ---

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

  for (const oldChild of oldChildren) {
    if (!oldChild) continue;
    if (oldChild.key !== null) {
      keyedOldMap.set(oldChild.key, oldChild);
    } else {
      unkeyedOldList.push(oldChild);
    }
  }

  let lastPlacedDom: Node | null = null;

  for (let i = 0; i < children.length; i++) {
    const newVNode = children[i];
    if (!newVNode) continue;

    let oldInstance: Instance | undefined;

    // 1. Match Finding
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

    // 2. Path & Anchor
    const childPath = createChildPath(path, newVNode.key ?? null, i);
    const effectiveAnchorSource = lastPlacedDom ? lastPlacedDom.nextSibling : startAnchor;
    const anchor = getNextUsableAnchor(effectiveAnchorSource);

    // 3. State Transfer
    if (oldInstance && oldInstance.path !== childPath) {
      const oldState = context.hooks.state.get(oldInstance.path);
      const oldCursor = context.hooks.cursor.get(oldInstance.path);

      if (oldState) {
        context.hooks.state.set(childPath, oldState);
        context.hooks.state.delete(oldInstance.path);
      }
      if (oldCursor !== undefined) {
        context.hooks.cursor.set(childPath, oldCursor);
        context.hooks.cursor.delete(oldInstance.path);
      }
      oldInstance.path = childPath;
    }

    const newInstance = reconcile(parentDom, oldInstance || null, newVNode, childPath, anchor);

    if (newInstance) {
      newInstances[i] = newInstance;
      const newDom = getFirstDom(newInstance);
      if (newDom) {
        if (!oldInstance || newDom.previousSibling !== lastPlacedDom) {
          insertInstance(parentDom, newInstance, anchor);
        }
        lastPlacedDom = newDom;
      }
    }
  }

  // [CRITICAL FIX] Collision Guard with skipStateDelete
  // 현재 생성된 자식들이 사용하는 Path 목록
  const activePaths = new Set(newInstances.map((i) => i?.path));

  // 삭제될 Unkeyed 자식들을 처리
  unkeyedOldList.forEach((oldChild) => {
    // 만약 삭제될 놈의 Path를 누군가(Footer) 이미 쓰고 있다면?
    const shouldSkipDelete = activePaths.has(oldChild.path);
    // DOM은 지우되, 상태는 지우지 마라! (Footer가 쓰고 있으니까)
    unmount(parentDom, oldChild, shouldSkipDelete);
  });

  // Keyed 자식들은 Path가 고유하므로(key 기반) 충돌 걱정 없이 삭제
  keyedOldMap.forEach((child) => unmount(parentDom, child));

  return newInstances;
}

// --- Main Reconcile (v17과 동일) ---
export function reconcile(
  parentDom: HTMLElement,
  instance: Instance | null,
  node: VNode | null,
  path: string,

  _anchor: HTMLElement | Text | null = null,
): Instance | null {
  if (node === null) {
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
