import type { LaunchComposer } from "./launch-composer";

const ACTION_NAME = "Vamp this token";
const ACTION_SELECTOR = '[data-vamp-action="true"]';
const CARD_SELECTOR = '[data-testid="trenches-card"]';
const CARD_ACTIONS_SELECTOR = '[data-testid="card-hover-actions"]';
const CHART_RAIL_SELECTOR = '[data-testid="chart-action-rail"]';
const ROUTE_CHANGE_EVENT = "vamp:locationchange";

type NativeActionState = {
  nodes: Node[];
  ariaLabel: string | null;
  title: string | null;
  style: string | null;
};

export function installGmgnCaptureBridge(launchComposer: LaunchComposer): void {
  let tokenSurfaceRefreshScheduled = false;
  const replacedNativeActions = new Map<HTMLButtonElement, NativeActionState>();
  const actionCleanup = new WeakMap<HTMLButtonElement, () => void>();
  const tooltip = createTooltip();

  function routeTargetsBsc(): boolean {
    const url = new URL(location.href);
    const queryChain = url.searchParams.get("chain")?.toLowerCase();
    if (queryChain) return queryChain === "bsc";

    const tokenRouteChain = url.pathname.match(/\/token\/([^/]+)/i)?.[1]?.toLowerCase();
    if (tokenRouteChain) return tokenRouteChain === "bsc";

    return document.body?.dataset.chain?.toLowerCase() === "bsc";
  }

  function createVampIcon(): HTMLImageElement {
    const image = document.createElement("img");
    image.src = chrome.runtime.getURL("assets/vamp-128.png");
    image.alt = "";
    image.width = 20;
    image.height = 20;
    image.style.cssText = "position:absolute;left:50%;top:50%;display:block;width:20px;height:20px;border-radius:5px;object-fit:cover;transform:translate(-50%,-50%)";
    return image;
  }

  function showTooltip(button: HTMLButtonElement): void {
    const bounds = button.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, bounds.left + bounds.width / 2)}px`;
    tooltip.style.top = `${Math.max(8, bounds.bottom + 8)}px`;
    tooltip.hidden = false;
  }

  function hideTooltip(): void {
    tooltip.hidden = true;
  }

  function configureVampAction(button: HTMLButtonElement): void {
    const originalNodes = Array.from(button.childNodes);
    const placeholder = document.createElement("span");
    placeholder.dataset.vampGeometryPlaceholder = "true";
    placeholder.style.cssText = "visibility:hidden;display:inline-flex;align-items:center";
    placeholder.append(...originalNodes);

    if (getComputedStyle(button).position === "static") button.style.position = "relative";
    button.type = "button";
    button.dataset.vampAction = "true";
    button.setAttribute("aria-label", ACTION_NAME);
    button.setAttribute("aria-describedby", tooltip.id);
    button.removeAttribute("title");
    button.replaceChildren(placeholder, createVampIcon());

    const openLaunchComposer = () => {
      hideTooltip();
      launchComposer.open(button);
    };
    const show = () => showTooltip(button);
    button.addEventListener("click", openLaunchComposer);
    button.addEventListener("mouseenter", show);
    button.addEventListener("focus", show);
    button.addEventListener("mouseleave", hideTooltip);
    button.addEventListener("blur", hideTooltip);
    actionCleanup.set(button, () => {
      button.removeEventListener("click", openLaunchComposer);
      button.removeEventListener("mouseenter", show);
      button.removeEventListener("focus", show);
      button.removeEventListener("mouseleave", hideTooltip);
      button.removeEventListener("blur", hideTooltip);
    });
  }

  function actionName(button: HTMLButtonElement): string {
    return (button.getAttribute("aria-label") ?? button.textContent ?? "").trim().replace(/\s+/g, " ");
  }

  function injectTrenchesActions(): void {
    document.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach((card) => {
      const actionGroup = card.querySelector<HTMLElement>(CARD_ACTIONS_SELECTOR);
      if (!actionGroup || actionGroup.querySelector(ACTION_SELECTOR)) return;
      const buyActions = Array.from(actionGroup.querySelectorAll<HTMLButtonElement>("button")).filter(
        (button) => actionName(button).toLowerCase() === "buy",
      );
      const secondBuy = buyActions[1];
      if (!secondBuy) return;

      replacedNativeActions.set(secondBuy, {
        nodes: Array.from(secondBuy.childNodes),
        ariaLabel: secondBuy.getAttribute("aria-label"),
        title: secondBuy.getAttribute("title"),
        style: secondBuy.getAttribute("style"),
      });
      configureVampAction(secondBuy);
    });
  }

  function injectChartAction(): void {
    const rail = document.querySelector<HTMLElement>(CHART_RAIL_SELECTOR);
    if (!rail || rail.querySelector(ACTION_SELECTOR)) return;
    const favorite = rail.querySelector<HTMLButtonElement>('button[aria-label="Favorite"]');
    if (!favorite) return;

    const button = favorite.cloneNode(true) as HTMLButtonElement;
    button.removeAttribute("id");
    configureVampAction(button);
    favorite.insertAdjacentElement("afterend", button);
  }

  function restoreNativeActions(): void {
    replacedNativeActions.forEach((state, button) => {
      actionCleanup.get(button)?.();
      button.replaceChildren(...state.nodes);
      state.ariaLabel === null ? button.removeAttribute("aria-label") : button.setAttribute("aria-label", state.ariaLabel);
      state.title === null ? button.removeAttribute("title") : button.setAttribute("title", state.title);
      state.style === null ? button.removeAttribute("style") : button.setAttribute("style", state.style);
      button.removeAttribute("aria-describedby");
      delete button.dataset.vampAction;
    });
    replacedNativeActions.clear();
  }

  function removeTokenSurfaceActions(): void {
    restoreNativeActions();
    document.querySelectorAll<HTMLButtonElement>(ACTION_SELECTOR).forEach((button) => {
      actionCleanup.get(button)?.();
      button.remove();
    });
    hideTooltip();
    launchComposer.dismiss();
  }

  function refreshTokenSurfaceActions(): void {
    tokenSurfaceRefreshScheduled = false;
    if (!routeTargetsBsc()) {
      removeTokenSurfaceActions();
      return;
    }
    injectTrenchesActions();
    injectChartAction();
  }

  function scheduleTokenSurfaceRefresh(): void {
    if (tokenSurfaceRefreshScheduled) return;
    tokenSurfaceRefreshScheduled = true;
    requestAnimationFrame(refreshTokenSurfaceActions);
  }

  const observer = new MutationObserver(scheduleTokenSurfaceRefresh);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-token-address", "data-chain", "data-surface"],
  });
  window.addEventListener(ROUTE_CHANGE_EVENT, scheduleTokenSurfaceRefresh);
  window.addEventListener("popstate", scheduleTokenSurfaceRefresh);
  window.addEventListener("hashchange", scheduleTokenSurfaceRefresh);
  scheduleTokenSurfaceRefresh();
}

function createTooltip(): HTMLDivElement {
  const tooltip = document.createElement("div");
  tooltip.id = "vamp-action-tooltip";
  tooltip.role = "tooltip";
  tooltip.textContent = ACTION_NAME;
  tooltip.hidden = true;
  tooltip.style.cssText = "position:fixed;z-index:2147483646;padding:6px 8px;color:#f3f4f6;background:#1b1d21;border:1px solid #363940;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.35);font:500 12px/1.2 Inter,ui-sans-serif,system-ui,sans-serif;pointer-events:none;transform:translateX(-50%);white-space:nowrap";
  document.body.append(tooltip);
  return tooltip;
}
