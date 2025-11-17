// core/dom.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NodeTypes } from "./constants";
import { Instance } from "./types";

// --- Prop 처리 ---
// (isEvent, isStyle, isClassName, isProperty, isGone, isNew, setDomProps는 v4와 동일)
const isEvent = (key: string) => key.startsWith("on");
const isStyle = (key: string) => key === "style";
const isClassName = (key: string) => key === "className";
const isProperty = (key: string) =>
  isClassName(key) || key === "checked" || key === "disabled" || key === "readOnly" || key === "value";
const isGone = (nextProps: Record<string, any>) => (key: string) => !(key in nextProps);
const isNew = (prevProps: Record<string, any>, nextProps: Record<string, any>) => (key: string) =>
  prevProps[key] !== nextProps[key];

export const setDomProps = (dom: HTMLElement, props: Record<string, any>): void => {
  updateDomProps(dom, {}, props);
};

export const updateDomProps = (
  dom: HTMLElement | Text,
  prevProps: Record<string, any> = {},
  nextProps: Record<string, any> = {},
): void => {
  // [FIX] 텍스트 노드 업데이트 로직 추가
  if (dom.nodeType === Node.TEXT_NODE) {
    if (prevProps.nodeValue !== nextProps.nodeValue) {
      dom.nodeValue = nextProps.nodeValue;
    }
    return;
  }

  const htmlDom = dom as HTMLElement;

  // 1. 이전 속성 제거 (이벤트) - (v4와 동일)
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => isGone(nextProps)(key) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      htmlDom.removeEventListener(eventType, prevProps[name]);
    });

  // 2. 이전 속성 제거 (스타일 외) - (v4와 동일)
  Object.keys(prevProps)
    .filter((key) => !isEvent(key) && !isStyle(key) && key !== "children")
    .filter(isGone(nextProps))
    .forEach((name) => {
      if (isProperty(name)) {
        (htmlDom as any)[name] = false;
      } else {
        htmlDom.removeAttribute(name);
      }
    });

  // 3. 스타일 속성 업데이트 (제거 및 변경) - (v4와 동일)
  const prevStyle = (prevProps.style || {}) as Record<string, string>;
  const nextStyle = (nextProps.style || {}) as Record<string, string>;
  Object.keys(prevStyle)
    .filter(isGone(nextStyle))
    .forEach((name) => {
      (htmlDom.style as any)[name] = "";
    });
  Object.keys(nextStyle)
    .filter(isNew(prevStyle, nextStyle))
    .forEach((name) => {
      (htmlDom.style as any)[name] = nextStyle[name];
    });

  // 4. 새 속성 설정 (이벤트) - (v4와 동일)
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      htmlDom.addEventListener(eventType, nextProps[name]);
    });

  // 5. 새 속성 설정 (스타일 외) - (v4와 동일)
  Object.keys(nextProps)
    .filter((key) => !isEvent(key) && !isStyle(key) && key !== "children")
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      if (isProperty(name)) {
        (htmlDom as any)[name] = nextProps[name];
      } else {
        htmlDom.setAttribute(name, nextProps[name]);
      }
    });
};

// --- DOM 탐색 및 조작 ---
// (v4 - Patched 코드를 사용합니다)

export const getDomNodes = (instance: Instance | null): (HTMLElement | Text)[] => {
  if (!instance) return [];
  const { kind, dom, children } = instance;
  if (kind === NodeTypes.HOST || kind === NodeTypes.TEXT) {
    return dom ? [dom] : [];
  }
  return children.flatMap(getDomNodes);
};

export const getFirstDom = (instance: Instance | null): HTMLElement | Text | null => {
  if (!instance) return null;
  const { kind, dom, children } = instance;
  if (kind === NodeTypes.HOST || kind === NodeTypes.TEXT) {
    return dom;
  }
  return getFirstDomFromChildren(children);
};

export const getFirstDomFromChildren = (children: (Instance | null)[]): HTMLElement | Text | null => {
  if (!children) return null;
  for (const child of children) {
    const dom = getFirstDom(child);
    if (dom) return dom;
  }
  return null;
};

export const insertInstance = (
  parentDom: HTMLElement,
  instance: Instance | null,
  anchor: HTMLElement | Text | null = null,
): void => {
  if (!instance) return;
  const domNodes = getDomNodes(instance);

  domNodes.forEach((dom) => {
    // [FIX] anchor가 존재하고, parentDom의 자식이 아닌 경우 anchor를 무시(null)합니다.
    // 이렇게 하면 insertBefore가 아닌 appendChild처럼 동작하여 크래시를 막고,
    // 최소한 DOM 트리에 노드가 추가되도록 보장합니다.
    let validAnchor = anchor;
    if (anchor && anchor.parentNode !== parentDom) {
      validAnchor = null;
    }

    parentDom.insertBefore(dom, validAnchor);
  });
};

export const removeInstance = (
  _parentDom: HTMLElement, // 더 이상 사용하지 않음 (안정성 위해 무시)
  instance: Instance | null,
): void => {
  if (!instance) return;
  const domNodes = getDomNodes(instance);

  domNodes.forEach((dom) => {
    // [FIX] 실제 부모 노드가 존재할 때만 제거를 시도합니다.
    if (dom.parentNode) {
      dom.parentNode.removeChild(dom);
    }
  });
};
