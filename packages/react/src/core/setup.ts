// core/setup.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
import { context } from "./context";
import { VNode } from "./types";
// [UPDATE] 'setDomProps'를 임포트합니다.
import { removeInstance, setDomProps } from "./dom";
import { cleanupUnusedHooks } from "./hooks";
import { render } from "./render";
import { TEXT_ELEMENT, Fragment } from "./constants";

/**
 * [Phase 3 업데이트]
 * VNode를 실제 DOM 노드로 변환하여 컨테이너에 삽입합니다.
 * 이제 'setDomProps'를 사용하여 모든 속성을 올바르게 설정합니다.
 */
function mount(node: VNode, container: HTMLElement) {
  if (node.type === Fragment && Array.isArray(node.props.children)) {
    node.props.children.forEach((child: VNode) => mount(child, container));
    return;
  }

  let dom: HTMLElement | Text;

  if (node.type === TEXT_ELEMENT) {
    dom = document.createTextNode(node.props.nodeValue as string);
  } else {
    // 1. DOM 요소 생성 (유형이 함수가 아니라고 가정)
    dom = document.createElement(node.type as string);

    // 2. [UPDATE] setDomProps를 사용하여 모든 속성(style, event 등)을 설정합니다.
    //    이것이 "3단계: style 객체..." 테스트를 통과시킵니다.
    setDomProps(dom as HTMLElement, node.props);
  }

  // 3. 자식 노드 재귀 마운트
  if (node.props.children) {
    node.props.children.forEach((child: VNode) => {
      // 자식의 부모는 'dom' 요소입니다.
      mount(child, dom as HTMLElement);
    });
  }

  // 4. 생성된 DOM을 부모 컨테이너에 삽입
  container.appendChild(dom);
}

/**
 * Mini-React 애플리케이션의 루트를 설정하고 첫 렌더링을 시작합니다.
 */
export const setup = (rootNode: VNode | null, container: HTMLElement): void => {
  // 1. 컨테이너 유효성 검사
  if (!container || typeof container.appendChild !== "function") {
    throw new Error("MiniReact: 렌더 타깃 컨테이너가 유효하지 않습니다.");
  }

  // 2. 루트 VNode 유효성 검사
  if (!rootNode) {
    throw new Error("MiniReact: 루트 엘리먼트는 null일 수 없습니다.");
  }

  // 3. 이전 렌더링 내용 정리
  container.innerHTML = "";

  // 4. 첫 렌더링 실행
  mount(rootNode, container);
};
