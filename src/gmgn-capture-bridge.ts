import type { LaunchComposer } from "./launch-composer";
import type { GmgnSourceTokenAdapter } from "./gmgn-source-token";
import { readCachedFlapTaxInfo } from "./flap-tax-inspector";
import { handoffOfficialLaunch, type OfficialLaunchDestination } from "./official-launch-handoff";

const ACTION_NAME = "Vamp this token";
const ACTION_SELECTOR = '[data-vamp-action="true"]';
const FLIP_TAX_ACTION_NAME = "Flip Tax";
const FLIP_TAX_ACTION_SELECTOR = '[data-flip-tax-action="true"]';
const ALL_ACTIONS_SELECTOR = `${ACTION_SELECTOR}, ${FLIP_TAX_ACTION_SELECTOR}`;
const PARTIAL_TAX_BADGE_SELECTOR = '[data-flap-tax-inspector-badge][data-state="partial"]';
const FIXTURE_CARD_SELECTOR = '[data-testid="trenches-card"]';
const FIXTURE_CARD_ACTIONS_SELECTOR = '[data-testid="card-hover-actions"]';
const LIVE_CARD_SELECTOR = '[href*="/bsc/token/"], [href*="/robinhood/token/"]';
const ROBINHOOD_PLATFORM_SELECTOR = 'a[href*="app.long.xyz/tokens/"], a[href*="ponsfamily.com/launchpad/"]';
const LIVE_BUY_CONTAINER_SELECTOR = ".BuyButton-continer";
const LIVE_BUY_ACTION_SELECTOR = '[data-testid="quickbuy"]';
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

  function sourceNetwork(): string {
    const url = new URL(location.href);
    const queryChain = url.searchParams.get("chain")?.toLowerCase();
    if (queryChain) return queryChain;

    const tokenRouteChain = (url.pathname.match(/^\/([^/]+)\/token\//i)?.[1]
      ?? url.pathname.match(/^\/token\/([^/]+)\//i)?.[1])?.toLowerCase();
    if (tokenRouteChain) return tokenRouteChain;

    return document.body?.dataset.chain?.toLowerCase() ?? "";
  }

  function routeTargetsSupportedSource(): boolean {
    const network = sourceNetwork();
    return network === "bsc" || (network === "robinhood" && document.querySelector(ROBINHOOD_PLATFORM_SELECTOR) !== null);
  }

  function cardTargetsSupportedSource(card: HTMLElement): boolean {
    return sourceNetwork() === "bsc" || card.querySelector(ROBINHOOD_PLATFORM_SELECTOR) !== null;
  }

  function createActionIcon(asset: string): HTMLImageElement {
    const image = document.createElement("img");
    image.src = chrome.runtime.getURL(asset);
    image.alt = "";
    image.width = 20;
    image.height = 20;
    image.style.cssText = "position:absolute;left:50%;top:50%;display:block;width:20px;height:20px;border-radius:5px;object-fit:cover;transform:translate(-50%,-50%)";
    return image;
  }

  function showTooltip(button: HTMLButtonElement, label: string): void {
    const bounds = button.getBoundingClientRect();
    tooltip.textContent = label;
    tooltip.style.left = `${Math.max(8, bounds.left + bounds.width / 2)}px`;
    tooltip.style.top = `${Math.max(8, bounds.bottom + 8)}px`;
    tooltip.hidden = false;
  }

  function hideTooltip(): void {
    tooltip.hidden = true;
  }

  function configureAction(button: HTMLButtonElement, kind: "vamp" | "flip-tax"): void {
    const flipTax = kind === "flip-tax";
    const label = flipTax ? FLIP_TAX_ACTION_NAME : ACTION_NAME;
    if (!button.style.position || button.style.position === "static") button.style.position = "relative";
    button.style.pointerEvents = "auto";
    button.style.cursor = "pointer";
    button.type = "button";
    if (flipTax) button.dataset.flipTaxAction = "true";
    else button.dataset.vampAction = "true";
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-describedby", tooltip.id);
    button.removeAttribute("title");
    button.replaceChildren(createActionIcon(flipTax ? "assets/flip-tax.png" : "assets/vamp-128.png"));

    const openLaunchComposer = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      hideTooltip();
      const sourceToken = sourceTokenAdapter.resolve(button);
      if (!sourceToken) return;
      const destination = sourceDestination(button);
      if (!flipTax && destination) {
        void handoffOfficialLaunch(destination, sourceToken);
        return;
      }
      if (flipTax) {
        const taxInfo = readCachedFlapTaxInfo(sourceToken.context.sourceAddress);
        if (!taxInfo || taxInfo.isUntaxed || taxInfo.dividendBps === 10_000) return;
        launchComposer.open(button, sourceToken, { kind: "flip-tax", sourceTaxInfo: taxInfo });
        return;
      }
      launchComposer.open(button, sourceToken);
    };
    const show = () => showTooltip(button, label);
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
    allTrenchesCards().filter((card) => !cardTargetsSupportedSource(card)).forEach((card) => {
      card.querySelectorAll<HTMLButtonElement>(ALL_ACTIONS_SELECTOR).forEach(removeAction);
    });
    trenchesCards().forEach((card) => {
      const fixtureActions = card.querySelector<HTMLElement>(FIXTURE_CARD_ACTIONS_SELECTOR);
      const liveBuyContainer = card.querySelector<HTMLElement>(LIVE_BUY_CONTAINER_SELECTOR);
      const actionGroup = fixtureActions ?? liveBuyContainer?.parentElement;
      if (!actionGroup) return;
      const insertionReference = fixtureActions?.querySelector<HTMLElement>("button") ?? liveBuyContainer;
      const presentationReference = fixtureActions?.querySelector<HTMLElement>("button")
        ?? liveBuyContainer?.querySelector<HTMLElement>(LIVE_BUY_ACTION_SELECTOR)
        ?? liveBuyContainer;
      if (!insertionReference || !presentationReference) return;

      let vamp = actionGroup.querySelector<HTMLButtonElement>(ACTION_SELECTOR);
      if (!vamp) {
        vamp = createPresentationMatchedButton(presentationReference);
        sizeLiveTrenchesAction(vamp, presentationReference, fixtureActions === null);
        configureAction(vamp, "vamp");
        actionGroup.insertBefore(vamp, insertionReference);
      }

      const partialBadge = card.querySelector<HTMLElement>(PARTIAL_TAX_BADGE_SELECTOR);
      const sourceInfo = partialBadge?.dataset.address ? readCachedFlapTaxInfo(partialBadge.dataset.address) : undefined;
      const shouldShowFlipTax = !!sourceInfo && !sourceInfo.isUntaxed && sourceInfo.dividendBps < 10_000;
      const flipTax = actionGroup.querySelector<HTMLButtonElement>(FLIP_TAX_ACTION_SELECTOR);
      if (shouldShowFlipTax && !flipTax) {
        const button = createPresentationMatchedButton(presentationReference);
        sizeLiveTrenchesAction(button, presentationReference, fixtureActions === null);
        configureAction(button, "flip-tax");
        actionGroup.insertBefore(button, vamp);
      } else if (!shouldShowFlipTax) {
        removeAction(flipTax);
      }
    });
  }

  function sourceDestination(button: HTMLButtonElement): OfficialLaunchDestination | null {
    const surface = button.closest<HTMLElement>(FIXTURE_CARD_SELECTOR) ?? button.closest<HTMLElement>(LIVE_CARD_SELECTOR) ?? document;
    if (surface.querySelector('a[href*="app.long.xyz/tokens/"]')) return "long";
    if (surface.querySelector('a[href*="ponsfamily.com/launchpad/"]')) return "pons";
    return null;
  }

  function sizeLiveTrenchesAction(button: HTMLButtonElement, reference: HTMLElement, live: boolean): void {
    if (!live) return;
    const bounds = reference.getBoundingClientRect();
    const size = Math.max(bounds.height, 32);
    button.style.width = `${size}px`;
    button.style.minWidth = `${size}px`;
    button.style.height = `${size}px`;
    button.style.padding = "0";
    button.style.flexShrink = "0";
  }

  function removeAction(button: HTMLButtonElement | null): void {
    if (!button) return;
    actionCleanup.get(button)?.();
    button.remove();
  }

  function trenchesCards(): HTMLElement[] {
    return allTrenchesCards().filter(cardTargetsSupportedSource);
  }

  function allTrenchesCards(): HTMLElement[] {
    const fixtures = Array.from(document.querySelectorAll<HTMLElement>(FIXTURE_CARD_SELECTOR));
    const live = Array.from(document.querySelectorAll<HTMLElement>(LIVE_CARD_SELECTOR))
      .filter((candidate) => candidate.querySelector(LIVE_BUY_CONTAINER_SELECTOR));
    return Array.from(new Set([...fixtures, ...live]));
  }

  function injectChartAction(): void {
    const rail = document.querySelector<HTMLElement>(CHART_RAIL_SELECTOR);
    if (rail) {
      const favorite = rail.querySelector<HTMLButtonElement>('button[aria-label="Favorite"]');
      if (!favorite) return;
      let vamp = rail.querySelector<HTMLButtonElement>(ACTION_SELECTOR);
      if (!vamp) {
        vamp = createPresentationMatchedButton(favorite);
        configureAction(vamp, "vamp");
        favorite.insertAdjacentElement("afterend", vamp);
      }
      syncChartFlipTaxAction(rail, favorite, vamp);
      return;
    }

    const header = document.querySelector<HTMLElement>(LIVE_CHART_HEADER_SELECTOR);
    const watch = header?.querySelector<HTMLElement>(LIVE_CHART_WATCH_SELECTOR);
    if (!header || !watch) return;
    const favorite = watch.querySelector<HTMLElement>(".cursor-pointer") ?? watch;
    const bounds = favorite.getBoundingClientRect();
    let stack = watch.parentElement?.hasAttribute("data-vamp-chart-stack") ? watch.parentElement : null;
    if (!stack) {
      stack = document.createElement("div");
      stack.dataset.vampChartStack = "true";
      stack.style.cssText = `position:relative;display:block;flex-shrink:0;width:${Math.max(bounds.width, 20)}px;height:${Math.max(bounds.height, 20)}px`;
      watch.parentElement?.insertBefore(stack, watch);
      stack.append(watch);
    }
    let vamp = stack.querySelector<HTMLButtonElement>(ACTION_SELECTOR);
    if (!vamp) {
      vamp = createPresentationMatchedButton(favorite);
      configureAction(vamp, "vamp");
      vamp.style.position = "absolute";
      vamp.style.top = `${Math.max(bounds.height, 20) + 4}px`;
      stack.append(vamp);
    }
    syncChartFlipTaxAction(stack, favorite, vamp);
  }

  function syncChartFlipTaxAction(container: HTMLElement, reference: HTMLElement, vamp: HTMLButtonElement): void {
    const partialBadge = document.querySelector<HTMLElement>(PARTIAL_TAX_BADGE_SELECTOR);
    const sourceInfo = partialBadge?.dataset.address ? readCachedFlapTaxInfo(partialBadge.dataset.address) : undefined;
    const shouldShowFlipTax = !!sourceInfo && !sourceInfo.isUntaxed && sourceInfo.dividendBps < 10_000;
    const stacked = container.hasAttribute("data-vamp-chart-stack");
    let flipTax = container.querySelector<HTMLButtonElement>(FLIP_TAX_ACTION_SELECTOR);
    if (shouldShowFlipTax && !flipTax) {
      flipTax = createPresentationMatchedButton(reference);
      configureAction(flipTax, "flip-tax");
      if (stacked) {
        const bounds = reference.getBoundingClientRect();
        flipTax.style.position = "absolute";
        flipTax.style.left = "0";
        flipTax.style.top = `${Math.max(bounds.height, 20) + 4}px`;
        container.append(flipTax);
      } else {
        container.insertBefore(flipTax, vamp);
      }
    } else if (!shouldShowFlipTax) {
      removeAction(flipTax);
      flipTax = null;
    }
    if (stacked) {
      const width = Math.max(reference.getBoundingClientRect().width, 20);
      vamp.style.left = flipTax ? `${width + 4}px` : "0";
      container.style.width = `${flipTax ? width * 2 + 4 : width}px`;
    }
  }

  function removeTokenSurfaceActions(): void {
    document.querySelectorAll<HTMLButtonElement>(ALL_ACTIONS_SELECTOR).forEach((button) => {
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
    if (!routeTargetsSupportedSource()) {
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
  tooltip.textContent = "";
  tooltip.hidden = true;
  tooltip.style.cssText = "position:fixed;z-index:2147483646;padding:6px 8px;color:#f3f4f6;background:#1b1d21;border:1px solid #363940;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.35);font:500 12px/1.2 Inter,ui-sans-serif,system-ui,sans-serif;pointer-events:none;transform:translateX(-50%);white-space:nowrap";
  document.body.append(tooltip);
  return tooltip;
}
