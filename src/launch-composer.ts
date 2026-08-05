import { getActiveTemplate } from "./launch-templates";
import { paymentAssetLabel } from "./payment-assets";

export interface LaunchComposer {
  open(invoker: HTMLButtonElement): void;
  dismiss(): void;
}

export function createLaunchComposer(): LaunchComposer {
  const host = document.createElement("div");
  host.dataset.vampLaunchComposer = "true";
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
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="vamp-launch-composer-title">
        <header>
          <div><img src="${chrome.runtime.getURL("assets/vamp-128.png")}" alt=""><h1 id="vamp-launch-composer-title">Launch Composer</h1></div>
          <button type="button" aria-label="Close Launch Composer">✕</button>
        </header>
        <div class="columns">
          <section aria-labelledby="vamp-metadata-heading"><h2 id="vamp-metadata-heading">Launch Metadata</h2><p>Source Token Launch Metadata will appear here.</p></section>
          <section aria-labelledby="vamp-mechanics-heading"><h2 id="vamp-mechanics-heading">Launch Mechanics</h2><div data-active-template><p>Loading Active Template…</p></div></section>
        </div>
      </div>
    </div>`;
  document.body.append(host);

  const closeButton = shadow.querySelector<HTMLButtonElement>("button")!;
  let invoker: HTMLButtonElement | undefined;

  const dismiss = () => {
    if (host.hidden) return;
    host.hidden = true;
    if (invoker?.isConnected) invoker.focus();
  };

  closeButton.addEventListener("click", dismiss);
  shadow.querySelector(".backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) dismiss();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !host.hidden) {
      event.preventDefault();
      dismiss();
    }
  });

  return {
    async open(button) {
      invoker = button;
      host.hidden = false;
      closeButton.focus();
      const template = await getActiveTemplate();
      const summary = shadow.querySelector<HTMLElement>("[data-active-template]")!;
      summary.replaceChildren();
      const label = document.createElement("p"); label.textContent = "Active Template";
      const name = document.createElement("strong"); name.textContent = template.name;
      const mechanics = document.createElement("p"); mechanics.textContent = `${paymentAssetLabel(template.mechanics.paymentAssetId)} · Buy tax ${template.mechanics.buyTaxPercent}% · Sell tax ${template.mechanics.sellTaxPercent}%`;
      summary.append(label, name, mechanics);
    },
    dismiss,
  };
}
