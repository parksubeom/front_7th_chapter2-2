import { cartStore, productStore, uiStore } from "./stores";
import { router } from "./router";
import { HomePage, NotFoundPage, ProductDetailPage } from "./pages";
import { useEffect, useState } from "react";

// 홈 페이지 (상품 목록)
router.addRoute("/", HomePage);
router.addRoute("/product/:id", ProductDetailPage);
router.addRoute(".*", NotFoundPage);

const useForceUpdate = () => {
  const [, setTick] = useState(0);
  return () => {
    console.log("[App] forceUpdate called");
    setTick((tick) => tick + 1);
  };
};

export function App() {
  const forceUpdate = useForceUpdate();
  const PageComponent = router.target;

  useEffect(() => {
    console.log("[App] useEffect 실행 시작");
    // 각 Store의 변화를 감지하여 자동 렌더링
    console.log("[App] productStore.subscribe 호출 전");
    productStore.subscribe(forceUpdate);
    console.log("[App] productStore.subscribe 호출 후");
    cartStore.subscribe(forceUpdate);
    uiStore.subscribe(forceUpdate);
    router.subscribe(forceUpdate);

    // 초기 fetch로 인한 state 변경이 이미 반영되었을 수 있으므로 한 번 강제 리렌더링
    console.log("[App] 초기 forceUpdate 트리거");
    forceUpdate();

    console.log("[App] useEffect 실행 완료");
  }, []);

  return <PageComponent />;
}
