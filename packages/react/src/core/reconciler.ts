// core/reconciler.ts (v18)
import { context, enterComponent, exitComponent } from "./context";
import { Fragment, NodeTypes, TEXT_ELEMENT, NodeType } from "./constants";
import { Instance, VNode } from "./types";
import { getFirstDom, insertInstance, removeInstance, setDomProps, updateDomProps } from "./dom";
import { createChildPath } from "./elements";
import { cleanupEffects, deleteComponentSafe } from "./hooks";

function getNextUsableAnchor(node: Node | null): HTMLElement | Text | null {
  if (node === null) return null;
  if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
    return node as HTMLElement | Text;
  }
  return getNextUsableAnchor(node.nextSibling);
}

/*function isDomNode(node: Node | null): node is HTMLElement | Text {
  return node !== null && (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE);
}*/

function getNodeType(type: VNode["type"]): NodeType {
  if (typeof type === "string") return NodeTypes.HOST;
  if (type === TEXT_ELEMENT) return NodeTypes.TEXT;
  if (type === Fragment) return NodeTypes.FRAGMENT;
  if (typeof type === "function") return NodeTypes.COMPONENT;
  throw new Error(`Unknown VNode type: ${String(type)}`);
}

// --- Mount / Update 통합 ---

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

// --- Update ---

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

// --- Unmount ---

function unmount(parentDom: HTMLElement, instance: Instance | null): void {
  if (!instance) return;

  // DOM 제거는 항상
  removeInstance(parentDom, instance);

  // Effect cleanup
  cleanupEffects(instance.path);

  // 상태 삭제는 path 존재 시 안전하게
  if (instance.path) deleteComponentSafe(instance.path);

  // 자식 unmount
  if (instance.children) {
    instance.children.forEach((child) => unmount(parentDom, child));
  }
}

// --- Reconcile Children (Strict Matching & State Transfer) ---

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
      // Strict Type Matching
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

    // 3. State Transfer with Safety
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

      // oldInstance.path 업데이트
      oldInstance.path = childPath;

      // ⚠ displacedInstance.path=null 제거 → DOM 삭제 보장
    }

    const newInstance = reconcile(parentDom, oldInstance || null, newVNode, childPath, anchor);

    if (newInstance) {
      newInstances[i] = newInstance;
      const newDom = getFirstDom(newInstance);
      if (newDom) {
        // DOM Placement
        if (!oldInstance || newDom.previousSibling !== lastPlacedDom) {
          insertInstance(parentDom, newInstance, anchor);
        }
        lastPlacedDom = newDom;
      }
    }
  }

  // 삭제 처리 시 안전하게 deleteComponentSafe 사용
  keyedOldMap.forEach((child) => {
    if (child.path !== null) unmount(parentDom, child);
  });
  unkeyedOldList.forEach((child) => {
    if (child.path !== null) unmount(parentDom, child);
  });

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
  if (node === null) {
    unmount(parentDom, instance);
    return null;
  }
  if (instance === null) {
    return mount(parentDom, node, path, _anchor);
  }
  // [FIX] node.type 자체가 변경되었는지 확인하여 컴포넌트 교체를 감지합니다.
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
