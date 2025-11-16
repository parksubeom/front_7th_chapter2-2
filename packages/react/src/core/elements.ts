// core/elements.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { isEmptyValue } from "../utils";
import { VNode } from "./types";
import { Fragment, TEXT_ELEMENT } from "./constants";

/**
 * 텍스트 노드를 위한 VNode를 생성합니다.
 */
const createTextElement = (nodeValue: string | number): VNode => {
  return {
    type: TEXT_ELEMENT,
    key: null,
    props: {
      children: [],
      // [FIX 1] nodeValue는 항상 문자열이어야 합니다. (테스트 실패 1 해결)
      nodeValue: String(nodeValue),
    },
  };
};

/**
 * 주어진 노드를 VNode 형식으로 정규화합니다.
 * null, undefined, boolean은 null로, 원시 타입은 텍스트 VNode로 변환합니다.
 */
export const normalizeNode = (node: any): VNode | null => {
  if (isEmptyValue(node) || typeof node === "boolean") {
    return null;
  }
  if (typeof node === "string" || typeof node === "number") {
    return createTextElement(node);
  }
  return node;
};

/**
 * JSX로부터 전달된 인자를 VNode 객체로 변환합니다.
 * 이 함수는 JSX 변환기에 의해 호출됩니다. (예: Babel, TypeScript)
 */
export const createElement = (
  type: string | symbol | React.ComponentType<any>,
  originProps?: Record<string, any> | null,
  ...rawChildren: any[]
) => {
  const props: any = {};
  let key: string | null = null;

  if (originProps) {
    for (const propName in originProps) {
      if (Object.prototype.hasOwnProperty.call(originProps, propName)) {
        if (propName === "key") {
          key = originProps[propName];
        } else {
          props[propName] = originProps[propName];
        }
      }
    }
  }

  const children = rawChildren
    .flat(Infinity)
    .map(normalizeNode)
    .filter((child): child is VNode => !!child);

  // [FIX 2] VNode(DOM) or Fragment는 항상 children 배열을 가집니다.
  //         컴포넌트는 자식이 있을 때만 children 배열을 추가합니다. (테스트 실패 2, 3 해결)
  if (typeof type === "string" || type === Fragment || children.length > 0) {
    props.children = children;
  }

  return {
    type,
    key,
    props,
  };
};

/**
 * 부모 경로와 자식의 key/index를 기반으로 고유한 경로를 생성합니다.
 * 이는 훅의 상태를 유지하고 Reconciliation에서 컴포넌트를 식별하는 데 사용됩니다.
 */
export const createChildPath = (parentPath: string, key: string | null, index: number): string => {
  if (key) {
    return `${parentPath}.k${key}`;
  }
  return `${parentPath}.i${index}`;
};
