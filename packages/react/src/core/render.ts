// core/render.ts
import { context, resetHookContext } from "./context";
import { reconcile } from "./reconciler";
// [FIX] enqueueEffects를 hooks에서 확실하게 가져옵니다.
import { cleanupUnusedHooks, setRenderTrigger, enqueueEffects } from "./hooks";
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

  // 5. [핵심] 이펙트 실행 트리거
  // 이 줄이 없으면 useEffect가 절대 실행되지 않습니다!
  enqueueEffects();
};

export const enqueueRender = withEnqueue(render);

// 훅스 모듈에 트리거 주입
setRenderTrigger(enqueueRender);
