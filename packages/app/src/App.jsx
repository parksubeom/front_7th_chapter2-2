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
  return () => setTick((tick) => tick + 1);
};
export function App() {
  const forceUpdate = useForceUpdate();
  const PageComponent = router.target;

  useEffect(() => {
    productStore.subscribe(forceUpdate);
    cartStore.subscribe(forceUpdate);
    uiStore.subscribe(forceUpdate);
    router.subscribe(forceUpdate);
    forceUpdate();
  }, []);

  return <PageComponent />;
}
