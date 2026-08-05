const ROUTE_CHANGE_EVENT = "vamp:locationchange";

function announceRouteChange(): void {
  window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));
}

for (const method of ["pushState", "replaceState"] as const) {
  const nativeMethod = history[method];
  history[method] = function (...args: Parameters<History[typeof method]>) {
    const result = nativeMethod.apply(this, args);
    announceRouteChange();
    return result;
  };
}

window.addEventListener("popstate", announceRouteChange);
window.addEventListener("hashchange", announceRouteChange);
