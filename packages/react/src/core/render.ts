// core/render.ts
import { context, resetHookContext } from "./context";
import { reconcile } from "./reconciler";
import { cleanupUnusedHooks } from "./hooks";
import { withEnqueue } from "../utils";

export const render = (): void => {
  console.log("렌더 시작된다잉 안되면 안해"); // [DEBUG] 렌더링 시작 확인

  try {
    // 1. 훅 컨텍스트 초기화
    resetHookContext();

    // 2. reconcile 함수 호출
    const newInstance = reconcile(context.root.container!, context.root.instance, context.root.node, "0", null);

    console.log("렌더 되잖아 미친놈아니야", newInstance); // [DEBUG] 리컨실리에이션 결과 확인

    // 3. 새 인스턴스 저장
    context.root.instance = newInstance;

    // 4. 훅 정리
    cleanupUnusedHooks();
  } catch (e) {
    console.error("❌ [render] Error:", e); // [DEBUG] 렌더링 중 에러 포착
  }
};

export const enqueueRender = withEnqueue(render);
