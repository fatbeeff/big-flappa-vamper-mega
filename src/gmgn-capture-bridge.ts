import type { LaunchComposer } from "./launch-composer";
import type { GmgnSourceTokenAdapter } from "./gmgn-source-token";

const ACTION_NAME = "Vamp this token";
const ACTION_SELECTOR = '[data-vamp-action="true"]';
const FIXTURE_CARD_SELECTOR = '[data-testid="trenches-card"]';
const CARD_LEFT_RAIL_SELECTOR = '[data-testid="card-left-hover-rail"]';
const LIVE_CARD_SELECTOR = '[href^="/bsc/token/"], [href^="https://gmgn.ai/bsc/token/"]';
const LIVE_BUY_CONTAINER_SELECTOR = ".BuyButton-continer";
const LIVE_LEFT_ACTION_SELECTOR = ".token-blacklist-button";
const CHART_RAIL_SELECTOR = '[data-testid="chart-action-rail"]';
const LIVE_CHART_HEADER_SELECTOR = '[data-sentry-component="BaseInfoBar"]';
const LIVE_CHART_WATCH_SELECTOR = '[data-sentry-component="TokenWatch"]';
const ROUTE_CHANGE_EVENT = "vamp:locationchange";

export function installGmgnCaptureBridge(
  launchComposer: LaunchComposer,
  sourceTokenAdapter: GmgnSourceTokenAdapter,
): void {
  let tokenSurfaceRefreshScheduled = false;
  const actionCleanup = new WeakMap<HTMLButtonElement, () => void>();
  const tooltip = createTooltip();

  function routeTargetsBsc(): boolean {
    const url = new URL(location.href);
    const queryChain = url.searchParams.get("chain")?.toLowerCase();
    if (queryChain) return queryChain === "bsc";

    const tokenRouteChain = (url.pathname.match(/^\/([^/]+)\/token\//i)?.[1]
      ?? url.pathname.match(/^\/token\/([^/]+)\//i)?.[1])?.toLowerCase();
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
      const sourceToken = sourceTokenAdapter.resolve(button);
      if (!sourceToken) return;
      launchComposer.open(button, sourceToken);
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

  function createPresentationMatchedButton(reference: HTMLElement): HTMLButtonElement {
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
    trenchesCards().forEach((card) => {
      const leftRail = card.querySelector<HTMLElement>(CARD_LEFT_RAIL_SELECTOR);
      const liveReference = card.querySelector<HTMLElement>(LIVE_LEFT_ACTION_SELECTOR);
      const liveRail = liveReference?.parentElement;
      const rail = leftRail ?? liveRail;
      if (!rail || rail.querySelector(ACTION_SELECTOR)) return;
      const presentationReference = leftRail?.querySelector<HTMLElement>("button") ?? liveReference;
      if (!presentationReference) return;

      const button = createPresentationMatchedButton(presentationReference);
      if (!leftRail) {
        // The current live rail is positioned around the 40px token image. Its
        // first two actions sit at -6px and 15px; Vamp occupies the third slot.
        button.style.position = "absolute";
        button.style.left = "-6px";
        button.style.top = "36px";
      }
      configureVampAction(button);
      rail.append(button);
    });
  }

  function trenchesCards(): HTMLElement[] {
    const fixtures = Array.from(document.querySelectorAll<HTMLElement>(FIXTURE_CARD_SELECTOR));
    const live = Array.from(document.querySelectorAll<HTMLElement>(LIVE_CARD_SELECTOR))
      .filter((candidate) => candidate.querySelector(LIVE_BUY_CONTAINER_SELECTOR));
    return Array.from(new Set([...fixtures, ...live]));
  }

  function injectChartAction(): void {
    const rail = document.querySelector<HTMLElement>(CHART_RAIL_SELECTOR);
    if (rail) {
      if (rail.querySelector(ACTION_SELECTOR)) return;
      const favorite = rail.querySelector<HTMLButtonElement>('button[aria-label="Favorite"]');
      if (!favorite) return;

      const button = createPresentationMatchedButton(favorite);
      configureVampAction(button);
      favorite.insertAdjacentElement("afterend", button);
      return;
    }

    const header = document.querySelector<HTMLElement>(LIVE_CHART_HEADER_SELECTOR);
    const watch = header?.querySelector<HTMLElement>(LIVE_CHART_WATCH_SELECTOR);
    if (!header || !watch || header.querySelector(ACTION_SELECTOR)) return;
    const favorite = watch.querySelector<HTMLElement>(".cursor-pointer") ?? watch;
    const bounds = favorite.getBoundingClientRect();
    const button = createPresentationMatchedButton(favorite);
    configureVampAction(button);
    const existingStack = watch.parentElement?.hasAttribute("data-vamp-chart-stack") ? watch.parentElement : null;
    if (existingStack) {
      button.style.position = "absolute";
      button.style.left = "0";
      button.style.top = `${Math.max(bounds.height, 20) + 4}px`;
      existingStack.append(button);
      return;
    }
    const stack = document.createElement("div");
    stack.dataset.vampChartStack = "true";
    stack.style.cssText = `position:relative;display:block;flex-shrink:0;width:${Math.max(bounds.width, 20)}px;height:${Math.max(bounds.height, 20)}px`;
    button.style.position = "absolute";
    button.style.left = "0";
    button.style.top = `${Math.max(bounds.height, 20) + 4}px`;
    watch.parentElement?.insertBefore(stack, watch);
    stack.append(watch, button);
  }

  function removeTokenSurfaceActions(): void {
    document.querySelectorAll<HTMLButtonElement>(ACTION_SELECTOR).forEach((button) => {
      actionCleanup.get(button)?.();
      button.remove();
    });
    document.querySelectorAll<HTMLElement>("[data-vamp-chart-stack]").forEach((stack) => {
      const watch = stack.querySelector<HTMLElement>(LIVE_CHART_WATCH_SELECTOR);
      if (watch && stack.parentElement) stack.parentElement.insertBefore(watch, stack);
      stack.remove();
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
    attributeFilter: ["data-token-address", "data-chain", "data-surface", "data-sentry-component", "href"],
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
