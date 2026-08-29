import { formatHolderBadge, formatTaxTitle, holderBadgeState, normalizeFlapTaxInfo, type FlapTaxInfo } from "./flap-tax-info";

const BADGE_ATTRIBUTE = "data-flap-tax-inspector-badge";
const BADGE_SELECTOR = `[${BADGE_ATTRIBUTE}]`;
const CARD_SELECTOR = "div[class*='group/a'], [data-testid='trenches-card']";
const TAX_CHIP_PATTERN = /^Tax\s+\d+(?:\.\d+)?%(?:\s*\/\s*\d+(?:\.\d+)?%)?$/i;
const CACHE_VERSION = 2;
const FLAP_CACHE_TTL_MS = 5 * 60 * 1000;
const PONS_CACHE_TTL_MS = 60 * 1000;
const BLOCKED_BADGE_EVENTS = ["pointerdown", "mousedown", "click", "dblclick", "touchstart", "contextmenu"] as const;

type TaxTarget = {
  address: string;
  platform: "flap" | "pons";
  host: HTMLElement;
  anchor: HTMLElement;
  iconSrc: string | null;
  placement: "before" | "after";
  surface: "trench" | "detail";
};

const memoryCache = new Map<string, { platform: TaxTarget["platform"]; savedAt: number; info: FlapTaxInfo }>();
let scanTimer: number | undefined;
let cacheExpiryTimer: number | undefined;
let scanRunning = false;
let rescanRequested = false;

export function installFlapTaxInspector(): void {
  new MutationObserver(() => scheduleScan(180)).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("vamp:locationchange", () => scheduleScan(0));
  window.addEventListener("popstate", () => scheduleScan(0));
  window.addEventListener("hashchange", () => scheduleScan(0));
  document.addEventListener("visibilitychange", () => scheduleScan(0));
  scheduleScan(0);
}

export function normalizeFlapAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.toLowerCase().match(/0x[0-9a-f]{40}/);
  return match && /(?:7777|8888)$/.test(match[0]) ? match[0] : null;
}

export function readCachedFlapTaxInfo(address: string): FlapTaxInfo | undefined {
  return recall("flap", address);
}

export function isFlapTaxCacheEntryFresh(savedAt: number, now = Date.now()): boolean {
  return savedAt > now - FLAP_CACHE_TTL_MS;
}

export function discoverGmgnTaxTargets(
  root: ParentNode = document,
  locationHref = location.href,
  limit = 36,
): TaxTarget[] {
  const url = gmgnUrl(locationHref);
  const platform = url ? platformFromUrl(url) : null;
  if (!url || !platform) return [];
  const detailAddress = addressFromGmgnUrl(url, platform);
  if (detailAddress) {
    const target = discoverDetailTarget(root, detailAddress, platform);
    return target ? [target] : [];
  }

  const targets: TaxTarget[] = [];
  for (const card of Array.from(root.querySelectorAll<HTMLElement>(CARD_SELECTOR))) {
    if (targets.length >= limit) break;
    if (card.querySelector(CARD_SELECTOR)) continue;
    const address = addressFromCard(card, url.href, platform);
    const taxChip = address ? exactTextNode(card, TAX_CHIP_PATTERN) : null;
    if (!address || !taxChip?.parentElement || !findPlatformLink(card, address, platform)) continue;
    targets.push({
      address,
      platform,
      host: card,
      anchor: visibleListAnchor(taxChip),
      iconSrc: platformIdentifierIcon(card, platform)?.src ?? null,
      placement: "before",
      surface: "trench",
    });
  }
  return targets;
}

async function scan(): Promise<void> {
  scanTimer = undefined;
  if (scanRunning) { rescanRequested = true; return; }
  if (document.visibilityState === "hidden") return;
  scanRunning = true;
  rescanRequested = false;
  try {
    let targets = discoverGmgnTaxTargets();
    cleanStaleBadges(targets);
    for (const platform of ["flap", "pons"] as const) {
      const addresses = [...new Set(targets.filter((target) => target.platform === platform).map(({ address }) => address))];
      await hydrate(platform, addresses);
      const missing = addresses.filter((address) => !recall(platform, address));
      if (missing.length) {
        const response: unknown = await chrome.runtime.sendMessage({ type: `vamp:inspect-${platform}-taxes`, addresses: missing });
        if (!isTaxResponse(response)) throw new Error(`${platform} tax inspection failed`);
        remember(platform, response.infoByAddress);
        void persist(platform, response.infoByAddress).catch(() => undefined);
      }
    }
    targets = discoverGmgnTaxTargets();
    cleanStaleBadges(targets);
    for (const target of targets) {
      const info = recall(target.platform, target.address);
      if (info) render(target, info);
    }
  } catch {
    // Leave GMGN untouched on network or decoding errors; a later mutation/navigation retries.
  } finally {
    scanRunning = false;
    scheduleNextCacheRefresh();
    if (rescanRequested) scheduleScan(120);
  }
}

function scheduleScan(delay: number): void {
  rescanRequested = true;
  if (scanTimer !== undefined || scanRunning || document.visibilityState === "hidden") return;
  scanTimer = window.setTimeout(() => void scan(), delay);
}

function scheduleNextCacheRefresh(): void {
  if (cacheExpiryTimer !== undefined) window.clearTimeout(cacheExpiryTimer);
  cacheExpiryTimer = undefined;
  const now = Date.now();
  for (const [key, { platform, savedAt }] of memoryCache) {
    if (!isTaxCacheEntryFresh(platform, savedAt, now)) memoryCache.delete(key);
  }
  if (document.visibilityState === "hidden" || memoryCache.size === 0) return;
  const expiresAt = Math.min(...Array.from(memoryCache.values(), ({ platform, savedAt }) => savedAt + cacheTtlMs(platform)));
  cacheExpiryTimer = window.setTimeout(() => {
    cacheExpiryTimer = undefined;
    scheduleScan(0);
  }, Math.max(0, expiresAt - now + 1));
}

async function hydrate(platform: TaxTarget["platform"], addresses: readonly string[]): Promise<void> {
  const missing = addresses.filter((address) => !recall(platform, address));
  if (!missing.length) return;
  const keys = missing.map((address) => cacheKey(platform, address));
  const cached = await chrome.storage.local.get(keys);
  for (const address of missing) {
    const entry = cached[cacheKey(platform, address)];
    if (typeof entry !== "object" || entry === null) continue;
    const savedAt = Reflect.get(entry, "savedAt");
    if (typeof savedAt !== "number" || !isTaxCacheEntryFresh(platform, savedAt)) continue;
    try { memoryCache.set(memoryKey(platform, address), { platform, savedAt, info: normalizeFlapTaxInfo(Reflect.get(entry, "info")) }); }
    catch { /* Ignore invalid or obsolete cache entries. */ }
  }
}

async function persist(platform: TaxTarget["platform"], infoByAddress: Record<string, FlapTaxInfo>): Promise<void> {
  const entries: Record<string, unknown> = {};
  for (const [address, candidate] of Object.entries(infoByAddress)) {
    const info = normalizeFlapTaxInfo(candidate);
    entries[cacheKey(platform, address)] = { savedAt: Date.now(), info };
  }
  await chrome.storage.local.set(entries);
}

function remember(platform: TaxTarget["platform"], infoByAddress: Record<string, FlapTaxInfo>): void {
  const savedAt = Date.now();
  for (const [address, candidate] of Object.entries(infoByAddress)) {
    memoryCache.set(memoryKey(platform, address), { platform, savedAt, info: normalizeFlapTaxInfo(candidate) });
  }
}

function recall(platform: TaxTarget["platform"], address: string): FlapTaxInfo | undefined {
  const key = memoryKey(platform, address);
  const entry = memoryCache.get(key);
  if (!entry) return undefined;
  if (!isTaxCacheEntryFresh(platform, entry.savedAt)) {
    memoryCache.delete(key);
    return undefined;
  }
  return entry.info;
}

function isTaxCacheEntryFresh(platform: TaxTarget["platform"], savedAt: number, now = Date.now()): boolean {
  return savedAt > now - cacheTtlMs(platform);
}

function cacheTtlMs(platform: TaxTarget["platform"]): number {
  return platform === "pons" ? PONS_CACHE_TTL_MS : FLAP_CACHE_TTL_MS;
}

function render(target: TaxTarget, info: FlapTaxInfo): void {
  const label = formatHolderBadge(info);
  const existing = target.host.querySelector<HTMLElement>(BADGE_SELECTOR);
  if (!label) { existing?.remove(); return; }
  let badge = existing;
  if (badge && badge.dataset.surface !== target.surface) { badge.remove(); badge = null; }
  if (!badge) {
    badge = createBadge(target.surface);
    place(target, badge);
  } else if (badge.dataset.address !== target.address || !isPlaced(target, badge)) {
    place(target, badge);
  }
  badge.dataset.address = target.address;
  badge.dataset.platform = target.platform;
  badge.dataset.surface = target.surface;
  badge.dataset.state = target.platform === "pons" && info.dividendBps > 0 ? "complete" : holderBadgeState(info);
  const renderKey = `${label}:${target.iconSrc ?? ""}`;
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
    badge.append(label);
    badge.dataset.renderKey = renderKey;
  }
  badge.title = formatTaxTitle(info);
}

function createBadge(surface: TaxTarget["surface"]): HTMLElement {
  const badge = document.createElement("span");
  badge.setAttribute(BADGE_ATTRIBUTE, "1");
  badge.dataset.surface = surface;
  if (surface !== "trench") {
    for (const type of BLOCKED_BADGE_EVENTS) {
      badge.addEventListener(type, (event) => {
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
      }, type === "touchstart" ? { passive: false } : undefined);
    }
  }
  return badge;
}

function cleanStaleBadges(targets: readonly TaxTarget[]): void {
  const owners = targets.map((target) => ({ ...target, keptBadge: false }));
  for (const badge of Array.from(document.querySelectorAll<HTMLElement>(BADGE_SELECTOR))) {
    const owner = owners.find((candidate) => candidate.host.contains(badge));
    if (!owner || owner.address !== badge.dataset.address || owner.keptBadge) { badge.remove(); continue; }
    owner.keptBadge = true;
  }
}

function discoverDetailTarget(root: ParentNode, address: string, platform: TaxTarget["platform"]): TaxTarget | null {
  const platformLink = findPlatformLink(root, address, platform);
  const infoBar = platformLink?.closest<HTMLElement>('[data-sentry-component="BaseInfoBar"]');
  if (platformLink && infoBar) {
    let identity = platformLink.parentElement;
    while (identity && identity.parentElement?.parentElement !== infoBar) identity = identity.parentElement;
    if (identity) {
      return {
        address,
        platform,
        host: infoBar,
        anchor: identity,
        iconSrc: platformIdentifierIcon(identity, platform)?.src ?? null,
        placement: "after",
        surface: "detail",
      };
    }
  }
  const addressLeaf = findDetailAddressLeaf(root, address);
  const imageContainer = findDetailImageContainerFromPlatformLink(root, address, platform) ?? findDetailImageContainerNearAddress(addressLeaf);
  const iconSrc = platformIdentifierIcon(imageContainer ?? root, platform)?.src ?? null;
  const telegramControl = findDetailTelegramControl(imageContainer);
  if (telegramControl?.parentElement) return { address, platform, host: telegramControl.parentElement, anchor: telegramControl, iconSrc, placement: "after", surface: "detail" };
  if (imageContainer?.parentElement) return { address, platform, host: imageContainer.parentElement, anchor: imageContainer, iconSrc, placement: "after", surface: "detail" };
  if (addressLeaf?.parentElement) return { address, platform, host: addressLeaf.parentElement, anchor: addressLeaf, iconSrc, placement: "after", surface: "detail" };
  const field = findTotalTaxField(root);
  return field?.parentElement ? { address, platform, host: field.parentElement, anchor: field, iconSrc, placement: "after", surface: "detail" } : null;
}

function findPlatformLink(root: ParentNode, address: string, platform: TaxTarget["platform"]): HTMLAnchorElement | null {
  const selector = platform === "flap" ? "a[href^='https://flap.sh/bnb/']" : "a[href*='ponsfamily.com/launchpad/']";
  const expectedPath = platform === "flap" ? `/bnb/${address}` : `/launchpad/${address}`;
  for (const anchor of Array.from(root.querySelectorAll<HTMLAnchorElement>(selector))) {
    try { if (new URL(anchor.href).pathname.toLowerCase() === expectedPath) return anchor; }
    catch { /* Ignore malformed links. */ }
  }
  return null;
}

function platformIdentifierIcon(root: ParentNode, platform: TaxTarget["platform"]): HTMLImageElement | null {
  if (platform === "pons") {
    return root.querySelector<HTMLImageElement>("img[src*='/static/quotes/']")
      ?? root.querySelector<HTMLImageElement>("img[alt='Pons V2 Icon'], img[src*='pons']");
  }
  return root.querySelector<HTMLImageElement>("img[alt='Flap Tax Icon'], img[src*='flap_14px'], img[src*='bsc-flap']");
}

function addressFromGmgnUrl(url: URL, platform: TaxTarget["platform"]): string | null {
  const chain = platform === "flap" ? "bsc" : "robinhood";
  const match = url.pathname.match(new RegExp(`^/(?:${chain}/token|token/${chain})/(0x[0-9a-f]{40})/?$`, "i"));
  return match ? normalizePlatformAddress(match[1], platform) : null;
}

function addressFromCard(card: HTMLElement, base: string, platform: TaxTarget["platform"]): string | null {
  for (const anchor of Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href*='0x'], a[href*='0X']"))) {
    const address = normalizePlatformAddress(anchor.href, platform);
    if (address) return address;
    try {
      const url = new URL(anchor.getAttribute("href") ?? "", base);
      if (url.hostname === "gmgn.ai") {
        const routeAddress = addressFromGmgnUrl(url, platform);
        if (routeAddress) return routeAddress;
      }
    } catch { /* Ignore malformed links. */ }
  }
  return null;
}

function findDetailAddressLeaf(root: ParentNode, address: string): HTMLElement | null {
  const short = `0x${address.slice(2, 4)}...${address.slice(-4)}`;
  for (const node of Array.from(root.querySelectorAll<HTMLElement>("span, div"))) {
    if (node.children.length === 0 && node.textContent?.trim().toLowerCase() === short) return node;
  }
  return null;
}

function findDetailImageContainerFromPlatformLink(root: ParentNode, address: string, platform: TaxTarget["platform"]): HTMLElement | null {
  const link = findPlatformLink(root, address, platform);
  for (const anchor of link ? [link] : []) {
    if (anchor.closest(CARD_SELECTOR)) continue;
    let container: HTMLElement | null = anchor.parentElement;
    for (let depth = 0; container && depth < 4; depth += 1, container = container.parentElement) {
      if (container.querySelector("img")) return container;
    }
  }
  return null;
}

function findDetailImageContainerNearAddress(addressLeaf: HTMLElement | null): HTMLElement | null {
  let scope = addressLeaf?.parentElement ?? null;
  for (let depth = 0; scope && depth < 5; depth += 1, scope = scope.parentElement) {
    const image = scope.querySelector<HTMLElement>("img");
    if (!image) continue;
    let container = image;
    while (container.parentElement && container.parentElement !== scope) container = container.parentElement;
    return container;
  }
  return null;
}

function findDetailTelegramControl(imageContainer: HTMLElement | null): HTMLElement | null {
  return imageContainer?.parentElement?.querySelector<HTMLElement>(
    "button[aria-label='Share CA to Telegram'], a[aria-label='telegram' i], a[href^='https://t.me/'], a[href^='https://telegram.me/']",
  ) ?? null;
}

function findTotalTaxField(root: ParentNode): HTMLElement | null {
  const label = exactTextNode(root, /^Total Tax$/);
  const field = label?.closest<HTMLElement>(".text-left") ?? label?.parentElement?.parentElement;
  return field instanceof HTMLElement ? field : null;
}

function exactTextNode(root: ParentNode, pattern: RegExp): HTMLElement | null {
  for (const node of Array.from(root.querySelectorAll<HTMLElement>("span, div"))) {
    if (pattern.test(node.textContent?.trim() ?? "")) return node;
  }
  return null;
}

function visibleListAnchor(taxChip: HTMLElement): HTMLElement {
  let anchor = taxChip;
  let parent = taxChip.parentElement;
  for (let depth = 0; parent && depth < 4; depth += 1, parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const clipped = [style.overflow, style.overflowX, style.overflowY].includes("hidden");
    const width = parent.getBoundingClientRect().width;
    if (clipped && width > 0 && width < 360) { anchor = parent; break; }
  }
  return anchor;
}

function place(target: TaxTarget, badge: HTMLElement): void {
  if (target.placement === "before") target.anchor.before(badge);
  else target.anchor.after(badge);
}

function isPlaced(target: TaxTarget, badge: HTMLElement): boolean {
  return target.placement === "before" ? target.anchor.previousSibling === badge : target.anchor.nextSibling === badge;
}

function gmgnUrl(value: string): URL | null {
  try {
    const url = new URL(value, "https://gmgn.ai/");
    return url.hostname === "gmgn.ai" ? url : null;
  } catch { return null; }
}

function platformFromUrl(url: URL): TaxTarget["platform"] | null {
  if (url.pathname.includes("/bsc/") || url.searchParams.get("chain") === "bsc") return "flap";
  if (url.pathname.includes("/robinhood/") || url.searchParams.get("chain") === "robinhood") return "pons";
  return null;
}

function normalizePlatformAddress(value: unknown, platform: TaxTarget["platform"]): string | null {
  if (platform === "flap") return normalizeFlapAddress(value);
  if (typeof value !== "string") return null;
  return value.toLowerCase().match(/0x[0-9a-f]{40}/)?.[0] ?? null;
}

function memoryKey(platform: TaxTarget["platform"], address: string): string {
  return `${platform}:${address.toLowerCase()}`;
}

function cacheKey(platform: TaxTarget["platform"], address: string): string {
  return `holder-tax-inspector:v${CACHE_VERSION}:${platform}:${address.toLowerCase()}`;
}

function isTaxResponse(value: unknown): value is { ok: true; infoByAddress: Record<string, FlapTaxInfo> } {
  return typeof value === "object" && value !== null && Reflect.get(value, "ok") === true
    && typeof Reflect.get(value, "infoByAddress") === "object" && Reflect.get(value, "infoByAddress") !== null;
}
