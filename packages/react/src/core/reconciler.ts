// core/reconciler.ts (v9 - Patched for Anchor Bug)
import { enterComponent, exitComponent } from "./context";
import { Fragment, NodeTypes, TEXT_ELEMENT, NodeType } from "./constants";
import { Instance, VNode } from "./types";
import { getFirstDom, insertInstance, removeInstance, setDomProps, updateDomProps } from "./dom";
import { createChildPath } from "./elements";
// [Stability] 'hooks.ts'가 아직 없으므로, 스텁(stub) 함수를 임포트합니다.
import { cleanupEffects } from "./hooks";

const getNodeType = (type: VNode["type"]): NodeType => {
  if (typeof type === "string") return NodeTypes.HOST;
  if (type === TEXT_ELEMENT) return NodeTypes.TEXT;
  if (type === Fragment) return NodeTypes.FRAGMENT;
  if (typeof type === "function") return NodeTypes.COMPONENT;
  throw new Error(`Unknown VNode type: ${String(type)}`);
};

// --- (mountComponent, updateComponent, unmount - v8과 동일) ---
const mountComponent = (
  parentDom: HTMLElement,
  node: VNode,
  path: string,
  anchor: HTMLElement | Text | null,
): Instance => {
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
};

const updateComponent = (
  parentDom: HTMLElement,
  instance: Instance,
  node: VNode,
  path: string,
  anchor: HTMLElement | Text | null,
): Instance => {
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
};

const unmount = (parentDom: HTMLElement, instance: Instance | null): void => {
  if (!instance) return;
  removeInstance(parentDom, instance);
  cleanupEffects(instance.path);
  if (instance.children) {
    instance.children.forEach((child) => unmount(parentDom, child));
  }
};
// --- (v8과 동일한 함수 끝) ---

// --- [FIX] mountHost/Fragment, updateHost/Fragment 수정 ---

const mountHost = (parentDom: HTMLElement, node: VNode, path: string, anchor: HTMLElement | Text | null): Instance => {
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

  // [FIX 2] 자식들은 자신의 DOM(dom) 내부에 마운트되며, 시작 anchor는 'null'입니다.
  instance.children = reconcileChildren(dom as HTMLElement, instance, node.props.children || [], path, null);

  insertInstance(parentDom, instance, anchor);
  return instance;
};

const mountFragment = (
  parentDom: HTMLElement,
  node: VNode,
  path: string,
  anchor: HTMLElement | Text | null,
): Instance => {
  const instance: Instance = {
    node,
    dom: null,
    children: [],
    path,
    kind: NodeTypes.FRAGMENT,
    key: node.key,
  };

  // [FIX 2] Fragment 자식들은 부모 DOM(parentDom)에 마운트되며,
  // 부모가 전달한 anchor를 시작 anchor로 사용합니다.
  instance.children = reconcileChildren(parentDom, instance, node.props.children || [], path, anchor);

  return instance;
};

const mount = (
  /* v8과 동일 */
  parentDom: HTMLElement,
  node: VNode,
  path: string,
  anchor: HTMLElement | Text | null,
): Instance => {
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
};

const updateHost = (parentDom: HTMLElement, instance: Instance, node: VNode, path: string): Instance => {
  updateDomProps(instance.dom!, instance.node.props, node.props);
  instance.node = node;
  // [FIX 2] 자식들의 시작 anchor는 'null' (자신의 DOM 내부)
  instance.children = reconcileChildren(instance.dom as HTMLElement, instance, node.props.children || [], path, null);
  return instance;
};

const updateFragment = (parentDom: HTMLElement, instance: Instance, node: VNode, path: string): Instance => {
  instance.node = node;
  // [FIX 2] Fragment 자식들의 시작 anchor는
  // '첫 번째 자식의 DOM' (즉, 부모가 전달했던 anchor와 같음)
  instance.children = reconcileChildren(parentDom, instance, node.props.children || [], path, getFirstDom(instance));
  return instance;
};

// --- 자식 재조정 (Diffing) ---

/**
 * [FIX 2] 시그니처에 'startAnchor' 추가
 */
function reconcileChildren(
  parentDom: HTMLElement,
  instance: Instance,
  children: VNode[],
  path: string,
  startAnchor: HTMLElement | Text | null, // [FIX 2]
): (Instance | null)[] {
  const oldChildren = instance.children || [];
  const newInstances: (Instance | null)[] = new Array(children.length).fill(null);

  // (v8의 Key-based 로직은 Phase 8에서 구현합니다)
  // [FIX 2] Phase 1~3 통과를 위해 v5의 비-Key 기반 로직으로 임시 롤백합니다.
  const len = Math.max(oldChildren.length, children.length);

  for (let i = 0; i < len; i++) {
    const oldInstance = oldChildren[i] || null;
    const newVNode = children[i] || null;

    // [FIX 2] anchor는 "다음" 형제의 DOM입니다.
    let anchor: HTMLElement | Text | null = null;
    for (let j = i + 1; j < oldChildren.length; j++) {
      anchor = getFirstDom(oldChildren[j]);
      if (anchor) break;
    }
    // [FIX 2] 다음 형제가 없으면, 부모가 전달한 startAnchor를 사용합니다.
    if (!anchor) {
      anchor = startAnchor;
    }

    // (v8의 key-based 로직을 임시로 사용합니다 - path 생성)
    const childPath = createChildPath(path, newVNode?.key ?? null, i);

    const newInstance = reconcile(parentDom, oldInstance, newVNode, childPath, anchor);
    newInstances[i] = newInstance;
  }
  return newInstances;
}

// --- 메인 Reconcile 함수 (v8과 동일) ---
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
