import {
  nonEmptyMetadata,
  type LaunchContext,
  type LaunchMetadataEnrichment,
  type SourceTokenIdentity,
} from "./launch-context";
import type { SourceTokenContractResolver } from "./source-token-contract-resolver";

const FIXTURE_CARD_SELECTOR = '[data-testid="trenches-card"]';
const LIVE_CARD_SELECTOR = '[href^="/bsc/token/"], [href^="https://gmgn.ai/bsc/token/"]';
const LIVE_CHART_HEADER_SELECTOR = '[data-sentry-component="BaseInfoBar"]';
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const METADATA_WAIT_TIMEOUT_MS = 5_000;
const ROUTE_CHANGE_EVENT = "vamp:locationchange";

export type ResolvedSourceToken = {
  context: LaunchContext;
  identity?: Promise<SourceTokenIdentity>;
  enrichment?: Promise<LaunchMetadataEnrichment>;
};

export interface GmgnSourceTokenAdapter {
  resolve(invoker: HTMLButtonElement): ResolvedSourceToken | undefined;
}

export function createGmgnSourceTokenAdapter(
  contractResolver: SourceTokenContractResolver,
): GmgnSourceTokenAdapter {
  return {
    resolve(invoker) {
      const surface = invoker.closest<HTMLElement>(FIXTURE_CARD_SELECTOR)
        ?? invoker.closest<HTMLElement>(LIVE_CARD_SELECTOR)
        ?? invoker.closest<HTMLElement>(LIVE_CHART_HEADER_SELECTOR)
        ?? document.querySelector<HTMLElement>("main");
      if (!surface) return undefined;
      const contextRoot = surface.querySelector<HTMLElement>('[data-testid="token-context"]') ?? surface;
      const sourceAddress = resolveSourceAddress(surface);
      const translatedName = readText(contextRoot, "[data-token-translation-name]")
        || readText(contextRoot, "h1, h2");
      const hasSourceAddress = ADDRESS_PATTERN.test(sourceAddress);
      if (!hasSourceAddress && !translatedName) return undefined;

      const captured = captureMetadata(contextRoot);
      const context: LaunchContext = {
        sourceAddress,
        originalName: "",
        originalSymbol: "",
        translatedName: translatedName || undefined,
        translatedSymbol: readText(contextRoot, "[data-token-translation-symbol]") || undefined,
        ...captured,
      };
      return {
        context,
        identity: hasSourceAddress ? contractResolver.resolve(sourceAddress) : undefined,
        enrichment: contextRoot.getAttribute("aria-busy") === "true"
          ? waitForMetadata(contextRoot, surface, sourceAddress)
          : undefined,
      };
    },
  };
}

function resolveSourceAddress(surface: HTMLElement): string {
  const cardAddress = surface.closest<HTMLElement>(FIXTURE_CARD_SELECTOR)?.dataset.tokenAddress
    ?? surface.dataset.tokenAddress;
  if (cardAddress && ADDRESS_PATTERN.test(cardAddress)) return cardAddress;
  const cardHref = surface.closest<HTMLElement>(LIVE_CARD_SELECTOR)?.getAttribute("href") ?? surface.getAttribute("href");
  const hrefAddress = cardHref?.match(/\/bsc\/token\/(0x[0-9a-f]{40})(?:\/|$)/i)?.[1];
  if (hrefAddress) return hrefAddress;
  const routeAddress = new URL(location.href).pathname.match(/\/(?:token\/bsc|bsc\/token)\/(0x[0-9a-f]{40})(?:\/|$)/i)?.[1];
  return routeAddress ?? "";
}

function captureMetadata(root: HTMLElement): LaunchMetadataEnrichment & { imageUrl: string; description: string; website: string; x: string; telegram: string } {
  return {
    imageUrl: root.querySelector<HTMLImageElement>("[data-token-primary-image]")?.currentSrc
      || root.querySelector<HTMLImageElement>("[data-token-primary-image]")?.src
      || root.querySelector<HTMLImageElement>("img.w-full.h-full.object-cover")?.currentSrc
      || root.querySelector<HTMLImageElement>("img.w-full.h-full.object-cover")?.src
      || "",
    description: readText(root, "[data-token-description]"),
    website: readLink(root, "website"),
    x: readLink(root, "x"),
    telegram: readLink(root, "telegram"),
  };
}

function waitForMetadata(
  root: HTMLElement,
  surface: HTMLElement,
  sourceAddress: string,
): Promise<LaunchMetadataEnrichment> {
  return new Promise((resolve) => {
    let settled = false;
    let timeout = 0;

    const settle = (metadata: LaunchMetadataEnrichment = {}) => {
      if (settled) return;
      settled = true;
      metadataObserver.disconnect();
      addressObserver.disconnect();
      removalObserver.disconnect();
      window.clearTimeout(timeout);
      window.removeEventListener(ROUTE_CHANGE_EVENT, checkLifecycle);
      window.removeEventListener("popstate", checkLifecycle);
      window.removeEventListener("hashchange", checkLifecycle);
      resolve(metadata);
    };

    const checkLifecycle = () => {
      if (!root.isConnected || !surface.isConnected) return settle();
      if (sourceAddress && resolveSourceAddress(surface) !== sourceAddress) return settle();
      if (root.getAttribute("aria-busy") !== "true") {
        settle(nonEmptyMetadata(captureMetadata(root)));
      }
    };

    const metadataObserver = new MutationObserver(checkLifecycle);
    metadataObserver.observe(root, {
      attributes: true,
      attributeFilter: ["aria-busy"],
      childList: true,
      subtree: true,
      characterData: true,
    });

    const addressObserver = new MutationObserver(checkLifecycle);
    addressObserver.observe(surface, {
      attributes: true,
      attributeFilter: ["data-token-address"],
    });

    const removalObserver = new MutationObserver(checkLifecycle);
    removalObserver.observe(surface.parentElement ?? document.documentElement, {
      childList: true,
      subtree: true,
    });
    window.addEventListener(ROUTE_CHANGE_EVENT, checkLifecycle);
    window.addEventListener("popstate", checkLifecycle);
    window.addEventListener("hashchange", checkLifecycle);
    timeout = window.setTimeout(() => settle(), METADATA_WAIT_TIMEOUT_MS);
    queueMicrotask(checkLifecycle);
  });
}

function readText(root: HTMLElement, selector: string): string {
  return root.querySelector(selector)?.textContent?.trim() ?? "";
}

function readLink(root: HTMLElement, kind: string): string {
  const liveLabel = kind === "x" ? "twitter" : kind;
  const raw = (root.querySelector<HTMLAnchorElement>(`[data-token-link="${kind}"]`)
    ?? root.querySelector<HTMLAnchorElement>(`a[aria-label="${liveLabel}" i]`)
    ?? (kind === "telegram" ? root.querySelector<HTMLElement>('[data-key="telegram"], [data-icon="IconGmgntelegram312px"]')?.closest<HTMLAnchorElement>("a") : null))?.getAttribute("href")?.trim();
  return raw && raw !== location.href ? raw : "";
}
