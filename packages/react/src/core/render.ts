// core/render.ts
import { context, resetHookContext } from "./context";
import { reconcile } from "./reconciler";
import { cleanupUnusedHooks } from "./hooks";
import { withEnqueue } from "../utils";

export const render = (): void => {
  // 1. 훅 컨텍스트 초기화
  resetHookContext();

  // 2. reconcile 함수 호출
  const newInstance = reconcile(context.root.container!, context.root.instance, context.root.node, "0", null);

  // 3. 새 인스턴스 저장
  context.root.instance = newInstance;

  // 4. 훅 정리
  cleanupUnusedHooks();

  // [FIX] enqueueEffects() 호출 제거
  // useEffect 내부에서 이미 스케줄링하므로 여기서는 호출하지 않습니다.
  // 이로써 render.ts -> hooks.ts 의존성을 줄이고 순환 참조를 예방합니다.
};

export const enqueueRender = withEnqueue(render);
