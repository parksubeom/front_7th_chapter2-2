// core/dom.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NodeTypes } from "./constants";
import { Instance } from "./types";

// --- Prop 처리 ---

const isEvent = (key: string) => key.startsWith("on");
const isStyle = (key: string) => key === "style";
const isClassName = (key: string) => key === "className";
// [FIX 1] 'readOnly'를 프로퍼티 목록에 추가합니다.
const isProperty = (key: string) =>
  isClassName(key) ||
  key === "checked" ||
  key === "disabled" ||
  key === "readOnly" || // <-- TEST 1 FIX
  key === "value";
const isGone = (nextProps: Record<string, any>) => (key: string) => !(key in nextProps);
const isNew = (prevProps: Record<string, any>, nextProps: Record<string, any>) => (key: string) =>
  prevProps[key] !== nextProps[key];

/**
 * DOM 요소에 속성(props)을 설정합니다. (updateDomProps의 초기화 버전)
 */
export const setDomProps = (dom: HTMLElement, props: Record<string, any>): void => {
  updateDomProps(dom, {}, props);
};

/**
 * 이전 속성과 새로운 속성을 비교하여 DOM 요소의 속성을 업데이트합니다.
 */
export const updateDomProps = (
  dom: HTMLElement | Text,
  prevProps: Record<string, any> = {},
  nextProps: Record<string, any> = {},
): void => {
  if (dom.nodeType === Node.TEXT_NODE) return;

  const htmlDom = dom as HTMLElement;

  // 1. 이전 속성 제거 (이벤트) - (v2와 동일)
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
        // [FIX 2] boolean 속성을 제거할 때 "" 대신 false를 할당해야 합니다.
        (htmlDom as any)[name] = false;
        htmlDom.removeAttribute(name);
      } else {
        htmlDom.removeAttribute(name); // 일반 attribute
      }
    });

  // 3. 스타일 속성 업데이트 (제거 및 변경) - (v2와 동일)
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

  // 4. 새 속성 설정 (이벤트) - (v2와 동일)
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      htmlDom.addEventListener(eventType, nextProps[name]);
    });

  // 5. 새 속성 설정 (스타일 외) - (v2와 동일)
  Object.keys(nextProps)
    .filter((key) => !isEvent(key) && !isStyle(key) && key !== "children")
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      if (isProperty(name)) {
        const value = nextProps[name];

        // boolean prop
        if (typeof value === "boolean") {
          (htmlDom as any)[name] = value;

          if (value === true) {
            htmlDom.setAttribute(name.toLowerCase(), "");
          } else {
            htmlDom.removeAttribute(name.toLowerCase());
          }
          return;
        }

        // 일반 property
        (htmlDom as any)[name] = value;
      } else {
        htmlDom.setAttribute(name, nextProps[name]);
      }
    });
};

// --- DOM 탐색 및 조작 ---
// (v3 - Patched 코드를 사용합니다)

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
    parentDom.insertBefore(dom, anchor);
  });
};

export const removeInstance = (parentDom: HTMLElement, instance: Instance | null): void => {
  if (!instance) return;
  const domNodes = getDomNodes(instance);
  domNodes.forEach((dom) => {
    parentDom.removeChild(dom);
  });
};
