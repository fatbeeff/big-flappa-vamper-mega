import {
  nonEmptyMetadata,
  type LaunchContext,
  type LaunchMetadataEnrichment,
  type SourceTokenIdentity,
} from "./launch-context";
import type { SourceTokenContractResolver } from "./source-token-contract-resolver";

const CARD_SELECTOR = '[data-testid="trenches-card"]';
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;

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
      const surface = invoker.closest<HTMLElement>(CARD_SELECTOR) ?? document.querySelector<HTMLElement>("main");
      if (!surface) return undefined;
      const contextRoot = surface.querySelector<HTMLElement>('[data-testid="token-context"]') ?? surface;
      const sourceAddress = resolveSourceAddress(surface);
      const translatedName = readText(contextRoot, "[data-token-translation-name]")
        || readText(contextRoot, "h1, h2");
      if (!translatedName) return undefined;

      const captured = captureMetadata(contextRoot);
      const context: LaunchContext = {
        sourceAddress,
        originalName: "",
        originalSymbol: "",
        translatedName,
        translatedSymbol: readText(contextRoot, "[data-token-translation-symbol]") || undefined,
        ...captured,
      };
      return {
        context,
        identity: ADDRESS_PATTERN.test(sourceAddress) ? contractResolver.resolve(sourceAddress) : undefined,
        enrichment: contextRoot.getAttribute("aria-busy") === "true"
          ? waitForMetadata(contextRoot)
          : undefined,
      };
    },
  };
}

function resolveSourceAddress(surface: HTMLElement): string {
  const cardAddress = surface.closest<HTMLElement>(CARD_SELECTOR)?.dataset.tokenAddress
    ?? surface.dataset.tokenAddress;
  if (cardAddress && ADDRESS_PATTERN.test(cardAddress)) return cardAddress;
  const routeAddress = new URL(location.href).pathname.match(/\/token\/bsc\/(0x[0-9a-f]{40})(?:\/|$)/i)?.[1];
  return routeAddress ?? "";
}

function captureMetadata(root: HTMLElement): LaunchMetadataEnrichment & { imageUrl: string; description: string; website: string; x: string; telegram: string } {
  return {
    imageUrl: root.querySelector<HTMLImageElement>("[data-token-primary-image]")?.currentSrc
      || root.querySelector<HTMLImageElement>("[data-token-primary-image]")?.src
      || "",
    description: readText(root, "[data-token-description]"),
    website: readLink(root, "website"),
    x: readLink(root, "x"),
    telegram: readLink(root, "telegram"),
  };
}

function waitForMetadata(root: HTMLElement): Promise<LaunchMetadataEnrichment> {
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (root.getAttribute("aria-busy") === "true") return;
      observer.disconnect();
      resolve(nonEmptyMetadata(captureMetadata(root)));
    });
    observer.observe(root, { attributes: true, childList: true, subtree: true, characterData: true });
  });
}

function readText(root: HTMLElement, selector: string): string {
  return root.querySelector(selector)?.textContent?.trim() ?? "";
}

function readLink(root: HTMLElement, kind: string): string {
  const raw = root.querySelector<HTMLAnchorElement>(`[data-token-link="${kind}"]`)?.getAttribute("href")?.trim();
  return raw && raw !== location.href ? raw : "";
}
