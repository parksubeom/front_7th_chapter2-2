// core/dom.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NodeTypes } from "./constants";
import { Instance } from "./types";

// --- Prop 처리 ---
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
  // [DEBUG] DOM 업데이트 로그
  // console.log("🔧 [updateDomProps]", dom, prevProps, "->", nextProps);

  if (dom.nodeType === Node.TEXT_NODE) {
    if (prevProps.nodeValue !== nextProps.nodeValue) {
      // [DEBUG] 텍스트 변경 로그
      console.log(`📝 [TextUpdate] '${prevProps.nodeValue}' -> '${nextProps.nodeValue}'`);
      dom.nodeValue = nextProps.nodeValue;
    }
    return;
  }

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
        (htmlDom as any)[name] = false;
      } else {
        htmlDom.removeAttribute(name);
      }
    });

  // 3. 스타일 속성 업데이트
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
      // [DEBUG] 속성 변경 로그
      console.log(`🎨 [PropUpdate] ${name}:`, nextProps[name]);

      if (isProperty(name)) {
        (htmlDom as any)[name] = nextProps[name];
      } else {
        htmlDom.setAttribute(name, nextProps[name]);
      }
    });
};

// --- DOM 탐색 및 조작 ---

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
    // [DEBUG] DOM 삽입 로그
    console.log("➕ [insertInstance]", dom, "into", parentDom);

    let validAnchor = anchor;
    if (anchor && anchor.parentNode !== parentDom) {
      validAnchor = null;
    }

    parentDom.insertBefore(dom, validAnchor);
  });
};

export const removeInstance = (_parentDom: HTMLElement, instance: Instance | null): void => {
  if (!instance) return;
  const domNodes = getDomNodes(instance);

  domNodes.forEach((dom) => {
    if (dom.parentNode) {
      dom.parentNode.removeChild(dom);
    }
  });
};
