const ACTION_NAME = "Vamp this token";
const ACTION_SELECTOR = '[data-vamp-action="true"]';
const CARD_SELECTOR = '[data-testid="trenches-card"]';
const CARD_ACTIONS_SELECTOR = '[data-testid="card-hover-actions"]';
const CHART_RAIL_SELECTOR = '[data-testid="chart-action-rail"]';

let composer: ReturnType<typeof createComposer> | undefined;
let syncQueued = false;
const replacedNativeActions = new Map<
  HTMLButtonElement,
  { html: string; ariaLabel: string | null; title: string | null; style: string | null }
>();
const actionHandlers = new WeakMap<HTMLButtonElement, () => void>();

function isBscSurface(): boolean {
  const chain = document.body?.dataset.chain?.toLowerCase();
  const url = new URL(location.href);
  return chain === "bsc" || url.searchParams.get("chain")?.toLowerCase() === "bsc" || /\/bsc(?:\/|$)/i.test(url.pathname);
}

function vampIcon(): HTMLImageElement {
  const image = document.createElement("img");
  image.src = chrome.runtime.getURL("assets/vamp-128.png");
  image.alt = "";
  image.width = 20;
  image.height = 20;
  image.style.cssText = "display:block;width:20px;height:20px;border-radius:5px;object-fit:cover";
  return image;
}

function configureAction(button: HTMLButtonElement): void {
  const bounds = button.getBoundingClientRect();
  button.style.boxSizing = "border-box";
  if (bounds.width > 0) button.style.width = `${bounds.width}px`;
  if (bounds.height > 0) button.style.height = `${bounds.height}px`;
  button.type = "button";
  button.dataset.vampAction = "true";
  button.setAttribute("aria-label", ACTION_NAME);
  button.title = ACTION_NAME;
  button.replaceChildren(vampIcon());
  const handler = () => openComposer(button);
  actionHandlers.set(button, handler);
  button.addEventListener("click", handler);
}

function injectTrenchesActions(): void {
  document.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach((card) => {
    const actionGroup = card.querySelector<HTMLElement>(CARD_ACTIONS_SELECTOR);
    if (!actionGroup || actionGroup.querySelector(ACTION_SELECTOR)) return;
    const nativeActions = actionGroup.querySelectorAll<HTMLButtonElement>("button");
    const secondBuy = nativeActions.item(1);
    if (secondBuy) {
      replacedNativeActions.set(secondBuy, {
        html: secondBuy.innerHTML,
        ariaLabel: secondBuy.getAttribute("aria-label"),
        title: secondBuy.getAttribute("title"),
        style: secondBuy.getAttribute("style"),
      });
      configureAction(secondBuy);
    }
  });
}

function removeActions(): void {
  replacedNativeActions.forEach((state, button) => {
    const handler = actionHandlers.get(button);
    if (handler) button.removeEventListener("click", handler);
    button.innerHTML = state.html;
    state.ariaLabel === null ? button.removeAttribute("aria-label") : button.setAttribute("aria-label", state.ariaLabel);
    state.title === null ? button.removeAttribute("title") : button.setAttribute("title", state.title);
    state.style === null ? button.removeAttribute("style") : button.setAttribute("style", state.style);
    delete button.dataset.vampAction;
  });
  replacedNativeActions.clear();
  document.querySelectorAll<HTMLButtonElement>(ACTION_SELECTOR).forEach((button) => button.remove());
  composer?.remove();
  composer = undefined;
}

function injectChartAction(): void {
  const rail = document.querySelector<HTMLElement>(CHART_RAIL_SELECTOR);
  if (!rail || rail.querySelector(ACTION_SELECTOR)) return;
  const favorite = rail.querySelector<HTMLButtonElement>('button[aria-label="Favorite"]');
  if (!favorite) return;
  const button = document.createElement("button");
  button.className = favorite.className;
  button.style.cssText = favorite.style.cssText;
  configureAction(button);
  favorite.insertAdjacentElement("afterend", button);
}

function createComposer() {
  const host = document.createElement("div");
  host.dataset.vampComposer = "true";
  host.hidden = true;
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { position: fixed; inset: 0; z-index: 2147483647; }
      :host([hidden]) { display: none; }
      .backdrop { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(4, 5, 7, .72); backdrop-filter: blur(3px); }
      .dialog { width: min(780px, calc(100vw - 48px)); color: #f3f4f6; background: #15171a; border: 1px solid #32353b; border-radius: 14px; box-shadow: 0 24px 80px rgba(0,0,0,.55); font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid #2b2e33; }
      header div { display: flex; align-items: center; gap: 10px; }
      header img { width: 28px; height: 28px; border-radius: 7px; }
      h1 { margin: 0; font-size: 17px; }
      button { display: grid; place-items: center; width: 32px; height: 32px; color: #c8cbd1; background: #202227; border: 1px solid #363940; border-radius: 8px; cursor: pointer; }
      button:focus-visible { outline: 2px solid #ff5964; outline-offset: 2px; }
      .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 18px; }
      section { min-height: 150px; padding: 16px; background: #1b1d21; border: 1px solid #2b2e33; border-radius: 10px; }
      h2 { margin: 0 0 8px; font-size: 14px; }
      p { margin: 0; color: #989da6; font-size: 12px; line-height: 1.5; }
      @media (max-width: 640px) { .columns { grid-template-columns: 1fr; } }
    </style>
    <div class="backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="vamp-composer-title">
        <header>
          <div><img src="${chrome.runtime.getURL("assets/vamp-128.png")}" alt=""><h1 id="vamp-composer-title">Launch Composer</h1></div>
          <button type="button" aria-label="Close Launch Composer">✕</button>
        </header>
        <div class="columns">
          <section><h2>Launch Metadata</h2><p>Source Token details will appear here.</p></section>
          <section><h2>Launch Mechanics</h2><p>Active Template settings will appear here.</p></section>
        </div>
      </div>
    </div>`;
  document.body.append(host);
  const closeButton = shadow.querySelector<HTMLButtonElement>("button")!;
  let invoker: HTMLButtonElement | undefined;

  const close = () => {
    if (host.hidden) return;
    host.hidden = true;
    invoker?.focus();
  };
  closeButton.addEventListener("click", close);
  shadow.querySelector(".backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !host.hidden) {
      event.preventDefault();
      close();
    }
  });

  return {
    open(button: HTMLButtonElement) {
      invoker = button;
      host.hidden = false;
      closeButton.focus();
    },
    remove() {
      host.remove();
    },
  };
}

function openComposer(invoker: HTMLButtonElement): void {
  composer ??= createComposer();
  composer.open(invoker);
}

function sync(): void {
  syncQueued = false;
  if (!isBscSurface()) {
    removeActions();
    return;
  }
  injectTrenchesActions();
  injectChartAction();
}

function queueSync(): void {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(sync);
}

const observer = new MutationObserver(queueSync);
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-token-address", "data-chain", "data-surface"] });
window.addEventListener("popstate", queueSync);
window.addEventListener("hashchange", queueSync);
queueSync();
