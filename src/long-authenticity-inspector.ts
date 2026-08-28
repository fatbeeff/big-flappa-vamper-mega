import { normalizeLongAuthenticity, type LongAuthenticityInfo } from "./long-authenticity";

const BADGE_SELECTOR = "[data-long-authenticity-badge]";
const CARD_SELECTOR = "div[class*='group/a'], [data-testid='trench-token-card'], [data-testid='trenches-card']";
const LONG_LINK_SELECTOR = "a[href*='app.long.xyz/tokens/']";
const TAX_PATTERN = /^Tax\s+\d+(?:\.\d+)?%(?:\s*\/\s*\d+(?:\.\d+)?%)?$/i;
const CACHE_TTL_MS = 60 * 60 * 1000;
const FAILURE_TTL_MS = 30 * 1000;
const memory = new Map<string, { savedAt: number; info: LongAuthenticityInfo }>();
let timer: number | undefined;
let running = false;
let requested = false;

type Target = { address: string; card: HTMLElement; anchor: HTMLElement; iconSrc: string | null; surface: "trench" | "detail" };

export function installLongAuthenticityInspector(): void {
  new MutationObserver(() => {
    if (isRobinhoodLocation(location.href)) schedule(160);
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("vamp:locationchange", () => schedule(0));
  window.addEventListener("popstate", () => schedule(0));
  document.addEventListener("visibilitychange", () => schedule(0));
  schedule(0);
}

export function discoverLongTargets(root: ParentNode = document, limit = 36, locationHref = location.href): Target[] {
  if (!isRobinhoodLocation(locationHref)) return [];
  const detail = discoverDetailTarget(root, locationHref);
  if (detail) return [detail];
  const targets: Target[] = [];
  for (const card of Array.from(root.querySelectorAll<HTMLElement>(CARD_SELECTOR))) {
    if (targets.length >= limit) break;
    if (card.querySelector(CARD_SELECTOR)) continue;
    const link = card.querySelector<HTMLAnchorElement>(LONG_LINK_SELECTOR);
    const address = addressFromLongLink(link?.href);
    const tax = address ? exactText(card, TAX_PATTERN) : null;
    if (!address || !tax) continue;
    targets.push({
      address,
      card,
      anchor: tax.closest<HTMLElement>(".trenches-tax") ?? tax,
      iconSrc: card.querySelector<HTMLImageElement>("img[src*='/static/quotes/']")?.src
        ?? link?.querySelector<HTMLImageElement>("img")?.src
        ?? null,
      surface: "trench",
    });
  }
  return targets;
}

export function addressFromLongLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.hostname !== "app.long.xyz") return null;
    const match = url.pathname.match(/^\/tokens\/(0x[0-9a-f]{40})\/?$/i);
    return match?.[1].toLowerCase() ?? null;
  } catch { return null; }
}

export function isLongCacheEntryFresh(savedAt: number, info: LongAuthenticityInfo, now = Date.now()): boolean {
  const ttl = info.verdict === "unavailable" ? FAILURE_TTL_MS : CACHE_TTL_MS;
  return savedAt > now - ttl;
}

async function scan(): Promise<void> {
  timer = undefined;
  if (running) { requested = true; return; }
  if (document.visibilityState === "hidden") return;
  running = true;
  requested = false;
  try {
    let targets = discoverLongTargets();
    clean(targets);
    const addresses = [...new Set(targets.map(({ address }) => address))];
    for (const target of targets) render(target, recall(target.address) ?? null);
    await hydrate(addresses);
    const missing = addresses.filter((address) => !recall(address));
    for (const target of targets) render(target, recall(target.address) ?? null);
    if (!missing.length) return;
    const response: unknown = await chrome.runtime.sendMessage({ type: "vamp:inspect-robinhood-long", addresses: missing });
    if (isResponse(response)) {
      remember(response.infoByAddress);
      void persist(response.infoByAddress).catch(() => undefined);
    } else {
      remember(Object.fromEntries(missing.map((address) => [address, unavailable()])));
    }
    targets = discoverLongTargets();
    clean(targets);
    for (const target of targets) render(target, recall(target.address) ?? unavailable());
  } finally {
    running = false;
    if (requested) schedule(100);
  }
}

function render(target: Target, info: LongAuthenticityInfo | null): void {
  let badge = target.card.querySelector<HTMLElement>(BADGE_SELECTOR);
  if (!badge) {
    badge = document.createElement("span");
    badge.setAttribute("data-long-authenticity-badge", "1");
    target.anchor.after(badge);
  }
  badge.dataset.address = target.address;
  badge.dataset.surface = target.surface;
  badge.dataset.state = info?.verdict ?? "checking";
  const text = info ? label(info.verdict) : "CHECKING LONG";
  const renderKey = `${badge.dataset.state}:${target.iconSrc ?? ""}`;
  if (badge.dataset.renderKey !== renderKey) {
    badge.replaceChildren();
    if (target.iconSrc) {
      const icon = document.createElement("img");
      icon.alt = "";
      icon.decoding = "async";
      icon.loading = "lazy";
      icon.src = target.iconSrc;
      icon.addEventListener("error", () => { icon.hidden = true; }, { once: true });
      badge.append(icon);
    }
    badge.append(text);
    badge.dataset.renderKey = renderKey;
  }
  badge.title = info ? title(info) : "Checking Long.xyz authenticity…";
}

function label(verdict: LongAuthenticityInfo["verdict"]): string {
  if (verdict === "authentic") return "VERIFIED LONG";
  if (verdict === "fake") return "NOT LONG";
  return "LONG CHECK FAILED";
}

function title(info: LongAuthenticityInfo): string {
  if (info.verdict === "authentic") return "Long.xyz reports this token as authentic.";
  if (info.verdict === "unavailable") return "Long.xyz could not be reached. No authenticity claim was made.";
  return info.failures.length ? `Long.xyz reports this token as fake: ${info.failures.map(({ message }) => message).join("; ")}` : "Long.xyz reports this token as fake.";
}

function clean(targets: readonly Target[]): void {
  for (const badge of Array.from(document.querySelectorAll<HTMLElement>(BADGE_SELECTOR))) {
    const owner = targets.find(({ card }) => card.contains(badge));
    if (!owner || owner.address !== badge.dataset.address) badge.remove();
  }
}

function exactText(root: ParentNode, pattern: RegExp): HTMLElement | null {
  for (const node of Array.from(root.querySelectorAll<HTMLElement>("span, div"))) {
    if (node.children.length === 0 && pattern.test(node.textContent?.trim() ?? "")) return node;
  }
  return null;
}

function schedule(delay: number): void {
  requested = true;
  if (timer !== undefined || running || document.visibilityState === "hidden") return;
  timer = window.setTimeout(() => void scan(), delay);
}

function unavailable(): LongAuthenticityInfo {
  return { verdict: "unavailable", failures: [] };
}

function remember(infoByAddress: Record<string, LongAuthenticityInfo>): void {
  const savedAt = Date.now();
  for (const [address, value] of Object.entries(infoByAddress)) {
    memory.set(address.toLowerCase(), { savedAt, info: normalizeInfo(value) });
  }
}

async function hydrate(addresses: readonly string[]): Promise<void> {
  const missing = addresses.filter((address) => !recall(address));
  if (!missing.length) return;
  const cached = await chrome.storage.local.get(missing.map(cacheKey));
  for (const address of missing) {
    const entry = cached[cacheKey(address)];
    if (typeof entry !== "object" || entry === null) continue;
    const savedAt = Reflect.get(entry, "savedAt");
    const info = normalizeInfo(Reflect.get(entry, "info"));
    if (typeof savedAt === "number" && isLongCacheEntryFresh(savedAt, info)) memory.set(address, { savedAt, info });
  }
}

function recall(address: string): LongAuthenticityInfo | undefined {
  const key = address.toLowerCase();
  const entry = memory.get(key);
  if (!entry) return undefined;
  if (!isLongCacheEntryFresh(entry.savedAt, entry.info)) {
    memory.delete(key);
    return undefined;
  }
  return entry.info;
}

async function persist(infoByAddress: Record<string, LongAuthenticityInfo>): Promise<void> {
  await chrome.storage.local.set(Object.fromEntries(Object.entries(infoByAddress).map(([address, info]) => [
    cacheKey(address), { savedAt: Date.now(), info: normalizeInfo(info) },
  ])));
}

function normalizeInfo(value: unknown): LongAuthenticityInfo {
  const verdict = typeof value === "object" && value !== null ? Reflect.get(value, "verdict") : undefined;
  if (verdict !== "authentic" && verdict !== "fake" && verdict !== "unavailable") return unavailable();
  return normalizeLongAuthenticity({ result: { verdict, failures: Reflect.get(value as object, "failures") } });
}

function cacheKey(address: string): string {
  return `long-authenticity:v1:${address.toLowerCase()}`;
}

function discoverDetailTarget(root: ParentNode, locationHref: string): Target | null {
  let address: string;
  try {
    const url = new URL(locationHref, "https://gmgn.ai/");
    const match = url.hostname === "gmgn.ai" ? url.pathname.match(/^\/robinhood\/token\/(0x[0-9a-f]{40})\/?$/i) : null;
    if (!match) return null;
    address = match[1].toLowerCase();
  } catch { return null; }

  for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>(LONG_LINK_SELECTOR))) {
    if (addressFromLongLink(link.href) !== address) continue;
    const infoBar = link.closest<HTMLElement>('[data-sentry-component="BaseInfoBar"]');
    if (!infoBar) continue;
    let identity = link.parentElement;
    while (identity && identity.parentElement?.parentElement !== infoBar) identity = identity.parentElement;
    if (!identity) continue;
    return {
      address,
      card: infoBar,
      anchor: identity,
      iconSrc: link.querySelector<HTMLImageElement>("img")?.src ?? null,
      surface: "detail",
    };
  }
  return null;
}

function isRobinhoodLocation(value: string): boolean {
  try {
    const url = new URL(value, "https://gmgn.ai/");
    return url.hostname === "gmgn.ai"
      && (url.searchParams.get("chain") === "robinhood" || url.pathname.toLowerCase().includes("/robinhood/"));
  } catch { return false; }
}

function isResponse(value: unknown): value is { ok: true; infoByAddress: Record<string, LongAuthenticityInfo> } {
  return typeof value === "object" && value !== null && Reflect.get(value, "ok") === true
    && typeof Reflect.get(value, "infoByAddress") === "object" && Reflect.get(value, "infoByAddress") !== null;
}
