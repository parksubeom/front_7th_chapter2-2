// core/render.ts
import { context, resetHookContext } from "./context";
import { reconcile } from "./reconciler";
// [Stability] 'hooks.ts'가 아직 없으므로, 임시 스텁(stub) 함수를 정의합니다.
const cleanupUnusedHooks = () => {};
import { withEnqueue } from "../utils";

export const render = (): void => {
  resetHookContext(); // 1. 훅 컨텍스트 초기화
  // 2. reconcile 함수 호출 (5개 인자 전달)
  const newInstance = reconcile(
    context.root.container!,
    context.root.instance,
    context.root.node,
    "0", // 루트 경로
    null, // 루트 anchor
  );
  context.root.instance = newInstance; // 새 인스턴스 저장
  cleanupUnusedHooks(); // 3. 훅 정리 (스텁)
};

export const enqueueRender = withEnqueue(render);
