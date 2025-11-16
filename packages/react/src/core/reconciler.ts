// core/reconciler.ts (v12 - Stable and Type-Guarded)
import { enterComponent, exitComponent } from "./context";
import { Fragment, NodeTypes, TEXT_ELEMENT, NodeType } from "./constants";
import { Instance, VNode } from "./types";
import { getFirstDom, insertInstance, removeInstance, setDomProps, updateDomProps } from "./dom";
import { createChildPath } from "./elements";
import { cleanupEffects } from "./hooks";

/**
 * [FIX 2 - Helper] 주어진 노드가 유효한 DOM 노드(Element 또는 Text)인지 확인합니다.
 */
function isDomNode(node: Node | null): node is HTMLElement | Text {
  return node !== null && (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE);
}

/**
 * VNode의 type을 NodeType (string)으로 변환합니다.
 */
function getNodeType(type: VNode["type"]): NodeType {
  if (typeof type === "string") return NodeTypes.HOST;
  if (type === TEXT_ELEMENT) return NodeTypes.TEXT;
  if (type === Fragment) return NodeTypes.FRAGMENT;
  if (typeof type === "function") return NodeTypes.COMPONENT;
  throw new Error(`Unknown VNode type: ${String(type)}`);
}

// --- (상호 재귀 함수 선언 - Hoisting을 위해 function 사용) ---
// [FIX 1] function 선언을 사용하여 ts(2552) 에러를 제거합니다.

/**
 * 컴포넌트 VNode를 마운트합니다.
 */
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

/**
 * DOM/Text VNode를 마운트합니다.
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
 * Fragment VNode를 마운트합니다.
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
 * VNode 타입에 따라 적절한 mount 함수를 호출하는 라우터입니다.
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

// --- Update (기존 인스턴스 변경) ---

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
  instance.children = reconcileChildren(parentDom, instance, node.props.children || [], path, getFirstDom(instance));
  return instance;
}

// --- Unmount (제거) ---

function unmount(parentDom: HTMLElement, instance: Instance | null): void {
  if (!instance) return;
  removeInstance(parentDom, instance);
  cleanupEffects(instance.path);
  if (instance.children) {
    instance.children.forEach((child) => unmount(parentDom, child));
  }
}

// --- 자식 재조정 (Diffing) ---

/**
 * 자식 VNode 배열과 이전 인스턴스 배열을 비교하여 재조정합니다.
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

  const oldKeyMap = new Map<string, Instance>();
  for (const oldChild of oldChildren) {
    if (!oldChild) continue;
    const mapKey = oldChild.key !== null ? oldChild.key : `__index_${oldKeyMap.size}`;
    oldKeyMap.set(mapKey, oldChild);
  }

  let lastPlacedDom: Node | null = null; // Node 대신 ChildNode 사용을 방지합니다.

  for (let i = 0; i < children.length; i++) {
    const newVNode = children[i];
    if (!newVNode) continue;

    const mapKey = newVNode.key !== null ? newVNode.key : `__index_${i}`;
    const oldInstance = oldKeyMap.get(mapKey);
    const childPath = createChildPath(path, newVNode.key ?? null, i);

    // 1. [FIX 2] Anchor 계산: lastPlacedDom.nextSibling의 타입을 보호합니다.
    const nextSibling = lastPlacedDom ? lastPlacedDom.nextSibling : startAnchor;
    let anchor: HTMLElement | Text | null = null;

    if (isDomNode(nextSibling)) {
      // ChildNode가 HTMLElement 또는 Text인지 확인
      anchor = nextSibling;
    } else if (nextSibling === null) {
      anchor = null; // 다음 형제가 없으면 anchor도 null
    } else {
      // Comment 노드나 다른 타입을 건너뛰고 유효한 DOM 노드를 찾을 수도 있지만,
      // 현재 로직상 nextSibling이 null이 아니면 anchor가 되어야 하므로,
      // startAnchor가 ChildNode 타입인 경우에 대비하여 명시적으로 캐스팅합니다.
      /* eslint-disable @typescript-eslint/no-unused-vars */
      anchor = startAnchor;
    }

    // [Simplified Anchor Logic]
    // Anchor는 lastPlacedDom의 다음 노드이거나, 목록 시작점인 startAnchor입니다.
    const currentAnchor = lastPlacedDom ? lastPlacedDom.nextSibling : startAnchor;

    const newInstance = reconcile(
      parentDom,
      oldInstance || null,
      newVNode,
      childPath,
      isDomNode(currentAnchor) ? currentAnchor : null, // [FIX 2] ChildNode 타입 에러 방지
    );

    if (newInstance) {
      newInstances[i] = newInstance;

      const newDom = getFirstDom(newInstance);
      if (newDom) {
        // 2. [Placement Logic] DOM 위치 확인 및 이동/삽입 (movement logic)
        if (!oldInstance || newDom.previousSibling !== lastPlacedDom) {
          insertInstance(parentDom, newInstance, currentAnchor as HTMLElement | Text | null);
        }
        lastPlacedDom = newDom;
      }
      if (oldInstance) oldKeyMap.delete(mapKey);
    }
  }

  oldKeyMap.forEach((child) => unmount(parentDom, child));
  return newInstances;
}

// --- 메인 Reconcile 함수 ---
export function reconcile(
  parentDom: HTMLElement,
  instance: Instance | null,
  node: VNode | null,
  path: string,
  anchor: HTMLElement | Text | null = null,
): Instance | null {
  if (node === null) {
    unmount(parentDom, instance);
    return null;
  }
  if (instance === null) {
    return mount(parentDom, node, path, anchor);
  }
  if (instance.kind !== getNodeType(node.type) || instance.key !== node.key) {
    unmount(parentDom, instance);
    return mount(parentDom, node, path, anchor);
  }

  const nodeType = getNodeType(node.type);
  switch (nodeType) {
    case NodeTypes.COMPONENT:
      return updateComponent(parentDom, instance, node, path, anchor);
    case NodeTypes.HOST:
    case NodeTypes.TEXT:
      return updateHost(parentDom, instance, node, path);
    case NodeTypes.FRAGMENT:
      return updateFragment(parentDom, instance, node, path);
    default:
      throw new Error("Unknown node type during update");
  }
}
