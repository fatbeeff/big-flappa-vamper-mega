import type { LaunchComposer } from "./launch-composer";

const ACTION_NAME = "Vamp this token";
const ACTION_SELECTOR = '[data-vamp-action="true"]';
const CARD_SELECTOR = '[data-testid="trenches-card"]';
const CARD_LEFT_RAIL_SELECTOR = '[data-testid="card-left-hover-rail"]';
const CHART_RAIL_SELECTOR = '[data-testid="chart-action-rail"]';
const ROUTE_CHANGE_EVENT = "vamp:locationchange";

export function installGmgnCaptureBridge(launchComposer: LaunchComposer): void {
  let tokenSurfaceRefreshScheduled = false;
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
    if (getComputedStyle(button).position === "static") button.style.position = "relative";
    button.type = "button";
    button.dataset.vampAction = "true";
    button.setAttribute("aria-label", ACTION_NAME);
    button.setAttribute("aria-describedby", tooltip.id);
    button.removeAttribute("title");
    button.replaceChildren(createVampIcon());

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

  function createPresentationMatchedButton(reference: HTMLButtonElement): HTMLButtonElement {
    const referenceBounds = reference.getBoundingClientRect();
    const button = document.createElement("button");
    button.className = reference.className;
    button.style.cssText = reference.style.cssText;
    button.style.boxSizing = "border-box";
    if (referenceBounds.width > 0) button.style.width = `${referenceBounds.width}px`;
    if (referenceBounds.height > 0) button.style.height = `${referenceBounds.height}px`;
    return button;
  }

  function injectTrenchesActions(): void {
    document.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach((card) => {
      const leftRail = card.querySelector<HTMLElement>(CARD_LEFT_RAIL_SELECTOR);
      if (!leftRail || leftRail.querySelector(ACTION_SELECTOR)) return;
      const presentationReference = leftRail.querySelector<HTMLButtonElement>("button");
      if (!presentationReference) return;

      const button = createPresentationMatchedButton(presentationReference);
      configureVampAction(button);
      leftRail.append(button);
    });
  }

  function injectChartAction(): void {
    const rail = document.querySelector<HTMLElement>(CHART_RAIL_SELECTOR);
    if (!rail || rail.querySelector(ACTION_SELECTOR)) return;
    const favorite = rail.querySelector<HTMLButtonElement>('button[aria-label="Favorite"]');
    if (!favorite) return;

    const button = createPresentationMatchedButton(favorite);
    configureVampAction(button);
    favorite.insertAdjacentElement("afterend", button);
  }

  function removeTokenSurfaceActions(): void {
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
