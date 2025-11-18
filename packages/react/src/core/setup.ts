// core/setup.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
import { context } from "./context";
import { VNode } from "./types";
// [FIX] hooks.ts의 (스텁) 함수를 임포트해야 합니다.
import { cleanupUnusedHooks, setRenderTrigger } from "./hooks";
import { render, enqueueRender } from "./render";

/**
 * [DELETE]
 * 임시 mount 함수는 Phase 5의 reconciler가 대체하므로 제거합니다.
 */
// function mount(node: VNode, container: HTMLElement) { ... }

/**
 * [Phase 5 업데이트]
 * Mini-React 애플리케이션의 루트를 설정하고 첫 렌더링을 시작합니다.
 */
export const setup = (rootNode: VNode | null, container: HTMLElement): void => {
  // 0. [FIX] 렌더링 트리거 함수를 명시적으로 설정
  //    모듈 로드 순서 문제를 방지하기 위해 setup 시점에 확실히 설정합니다.
  setRenderTrigger(enqueueRender);

  // 1. 컨테이너 유효성 검사
  if (!container || typeof container.appendChild !== "function") {
    throw new Error("MiniReact: 렌더 타깃 컨테이너가 유효하지 않습니다.");
  }

  // 2. 루트 VNode 유효성 검사
  if (!rootNode) {
    throw new Error("MiniReact: 루트 엘리먼트는 null일 수 없습니다.");
  }

  // 3. [FIX] '렌더는 컨테이너 내용을 새 DOM으로 교체한다' 테스트 통과를 위해
  //    컨테이너를 비우는 로직을 여기에 다시 추가합니다.
  container.innerHTML = "";

  // 4. 루트 컨텍스트를 리셋합니다.
  context.root.reset({
    container,
    node: rootNode,
  });

  // 5. 첫 렌더링을 실행(트리거)합니다.
  render();
};
