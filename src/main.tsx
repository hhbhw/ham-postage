import { render } from "preact";
import { App } from "./App";
import "./style.css";

render(<App />, document.getElementById("app")!);

// 新 SW 通过 clientsClaim 接管时（部署新版本），自动 reload 一次，
// 避免「明明新版上了，用户看到的还是缓存里的旧版」。一次性，仅在已有控制器后切换才触发。
if ("serviceWorker" in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

