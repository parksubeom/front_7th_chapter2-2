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
    console.log("👉 [App] forceUpdate called!"); // [DEBUG 1]
    setTick((tick) => tick + 1);
  };
};
export function App() {
  const forceUpdate = useForceUpdate();
  const PageComponent = router.target;

  useEffect(() => {
    console.log("🔌 [App] useEffect: Subscribing to stores..."); // [DEBUG 2]
    // 각 Store의 변화를 감지하여 자동 렌더링
    cartStore.subscribe(forceUpdate);
    uiStore.subscribe(forceUpdate);
    router.subscribe(forceUpdate);
    productStore.subscribe(forceUpdate);
    forceUpdate();
  }, []);

  return <PageComponent />;
}
