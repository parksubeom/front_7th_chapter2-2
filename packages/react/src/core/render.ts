// core/render.ts
import { context, resetHookContext } from "./context";
import { reconcile } from "./reconciler";
import { setRenderTrigger, enqueueEffects } from "./hooks";
import { withEnqueue } from "../utils";

export const render = (): void => {
  try {
    console.log("[render] 렌더링 시작");
    // 1. 훅 컨텍스트 초기화
    resetHookContext();

    // 2. reconcile 함수 호출
    const newInstance = reconcile(context.root.container!, context.root.instance, context.root.node, "0", null);

    // 3. 새 인스턴스 저장
    context.root.instance = newInstance;

    console.log("[render] 렌더링 완료");

    // 4. [FIX] 렌더링 완료 후 effects 실행 (비동기로 실행)
    //    useEffect가 큐에 추가한 effects를 실행합니다.
    //    cleanupUnusedHooks()는 flushEffects() 내부에서 호출됩니다.
    //    비동기로 실행하여 테스트 요구사항을 만족시킵니다.
    enqueueEffects();
  } catch (e) {
    console.error("❌ [render] Error:", e);
  }
};

export const enqueueRender = withEnqueue(render);

// [FIX] 순환 참조 해결: 의존성 주입 패턴
// render.ts가 로드된 후 hooks.ts에 enqueueRender 함수를 주입합니다.
setRenderTrigger(enqueueRender);
console.log("[render] setRenderTrigger 호출 완료");
