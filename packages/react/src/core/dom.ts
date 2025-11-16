/* eslint-disable @typescript-eslint/no-explicit-any */
import { NodeTypes } from "./constants";
import { Instance } from "./types";

// --- Prop 처리 ---

const isEvent = (key: string) => key.startsWith("on");
const isStyle = (key: string) => key === "style";
const isClassName = (key: string) => key === "className";
const isProperty = (key: string) =>
  isClassName(key) || key === "checked" || key === "disabled" || key === "readonly" || key === "value"; // value는 프로퍼티로 설정해야 폼(form) 요소가 올바르게 동작합니다.
const isGone = (nextProps: Record<string, any>) => (key: string) => !(key in nextProps);
const isNew = (prevProps: Record<string, any>, nextProps: Record<string, any>) => (key: string) =>
  prevProps[key] !== nextProps[key];

/**
 * DOM 요소에 속성(props)을 설정합니다. (updateDomProps의 초기화 버전)
 */
export const setDomProps = (dom: HTMLElement, props: Record<string, any>): void => {
  // 초기 설정이므로 prevProps를 빈 객체로 넘깁니다.
  updateDomProps(dom, {}, props);
};

/**
 * 이전 속성과 새로운 속성을 비교하여 DOM 요소의 속성을 업데이트합니다.
 * [Phase 3] 테스트를 통과하기 위한 핵심 로직입니다.
 */
export const updateDomProps = (
  dom: HTMLElement | Text,
  prevProps: Record<string, any> = {},
  nextProps: Record<string, any> = {},
): void => {
  // 텍스트 노드는 prop이 없습니다.
  if (dom.nodeType === Node.TEXT_NODE) return;

  const htmlDom = dom as HTMLElement;

  // 1. 이전 속성 제거 (이벤트)
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => isGone(nextProps)(key) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      htmlDom.removeEventListener(eventType, prevProps[name]);
    });

  // 2. 이전 속성 제거 (스타일 외)
  Object.keys(prevProps)
    .filter((key) => !isEvent(key) && !isStyle(key) && key !== "children")
    .filter(isGone(nextProps))
    .forEach((name) => {
      if (isProperty(name)) {
        (htmlDom as any)[name] = ""; // boolean/property는 비우거나 false로
      } else {
        htmlDom.removeAttribute(name); // 일반 attribute
      }
    });

  // 3. 스타일 속성 업데이트 (제거 및 변경)
  const prevStyle = (prevProps.style || {}) as Record<string, string>;
  const nextStyle = (nextProps.style || {}) as Record<string, string>;

  // 3a. 이전 스타일 제거
  Object.keys(prevStyle)
    .filter(isGone(nextStyle))
    .forEach((name) => {
      (htmlDom.style as any)[name] = "";
    });

  // 3b. 새/변경된 스타일 적용
  Object.keys(nextStyle)
    .filter(isNew(prevStyle, nextStyle))
    .forEach((name) => {
      (htmlDom.style as any)[name] = nextStyle[name];
    });

  // 4. 새 속성 설정 (이벤트)
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      htmlDom.addEventListener(eventType, nextProps[name]);
    });

  // 5. 새 속성 설정 (스타일 외)
  Object.keys(nextProps)
    .filter((key) => !isEvent(key) && !isStyle(key) && key !== "children")
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      if (isProperty(name)) {
        (htmlDom as any)[name] = nextProps[name]; // 프로퍼티 설정
      } else {
        htmlDom.setAttribute(name, nextProps[name]); // 어트리뷰트 설정
      }
    });
};

// --- DOM 탐색 및 조작 ---

/**
 * 주어진 인스턴스에서 실제 DOM 노드(들)를 재귀적으로 찾아 배열로 반환합니다.
 * Fragment나 컴포넌트 인스턴스는 여러 개의 DOM 노드를 가질 수 있습니다.
 */
export const getDomNodes = (instance: Instance | null): (HTMLElement | Text)[] => {
  if (!instance) return [];

  const { node, dom, children } = instance;

  // 1. 호스트(DOM) 또는 텍스트 노드는 자신의 DOM을 반환
  if (dom !== null) {
    if (node.type === NodeTypes.HOST || node.type === NodeTypes.TEXT) {
      return [dom];
    } else {
      return [];
    }
  }

  // 2. 컴포넌트 또는 Fragment는 자식들의 DOM 노드를 재귀적으로 수집
  return children.flatMap(getDomNodes);
};

/**
 * 주어진 인스턴스에서 첫 번째 실제 DOM 노드를 찾습니다.
 * (reconciliation 중 anchor 계산에 사용됩니다)
 */
export const getFirstDom = (instance: Instance | null): HTMLElement | Text | null => {
  if (!instance) return null;

  const { node, dom, children } = instance;

  // 1. 호스트 또는 텍스트 노드는 자신의 DOM 반환
  if (node.type === NodeTypes.HOST || node.type === NodeTypes.TEXT) {
    return dom;
  }

  // 2. 컴포넌트 또는 Fragment는 자식 중 첫 번째 DOM 노드 반환
  return getFirstDomFromChildren(children);
};

/**
 * 자식 인스턴스들로부터 첫 번째 실제 DOM 노드를 찾습니다.
 */
export const getFirstDomFromChildren = (children: (Instance | null)[]): HTMLElement | Text | null => {
  for (const child of children) {
    const dom = getFirstDom(child);
    if (dom) {
      return dom;
    }
  }
  return null;
};

/**
 * 인스턴스를 부모 DOM에 삽입합니다.
 * anchor 노드가 주어지면 그 앞에 삽입하여 순서를 보장합니다.
 */
export const insertInstance = (
  parentDom: HTMLElement,
  instance: Instance | null,
  anchor: HTMLElement | Text | null = null,
): void => {
  if (!instance) return;

  // Fragment/Component를 대비해 모든 DOM 노드를 가져옵니다.
  const domNodes = getDomNodes(instance);

  domNodes.forEach((dom) => {
    // anchor가 null이면 appendChild와 동일하게 동작합니다.
    parentDom.insertBefore(dom, anchor);
  });
};

/**
 * 부모 DOM에서 인스턴스에 해당하는 모든 DOM 노드를 제거합니다.
 */
export const removeInstance = (parentDom: HTMLElement, instance: Instance | null): void => {
  if (!instance) return;

  // Fragment/Component를 대비해 모든 DOM 노드를 가져옵니다.
  const domNodes = getDomNodes(instance);

  domNodes.forEach((dom) => {
    parentDom.removeChild(dom);
  });
};
