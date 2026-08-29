import type { LaunchImageSource, LaunchMetadataValues } from "./launch-context";
import type { ResolvedSourceToken } from "./gmgn-source-token";
import type { PonsLaunchRequest } from "./pons-launch";
import { zeroAddress, type Address } from "viem";

type MetadataField = keyof LaunchMetadataValues;

export interface PonsLaunchComposer {
  open(invoker: HTMLButtonElement, source: ResolvedSourceToken, pairToken?: string): void;
  dismiss(): void;
}

export function createPonsLaunchComposer(): PonsLaunchComposer {
  const host = document.createElement("div");
  host.dataset.vampPonsComposer = "true";
  host.hidden = true;
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { position: fixed; inset: 0; z-index: 2147483647; }
      :host([hidden]) { display: none; }
      * { box-sizing: border-box; }
      .backdrop { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(4,5,7,.76); backdrop-filter: blur(3px); }
      .dialog { width: min(720px, calc(100vw - 48px)); max-height: calc(100vh - 48px); overflow: auto; color: #f3f4f6; background: #15171a; border: 1px solid #32353b; border-radius: 14px; box-shadow: 0 24px 80px rgba(0,0,0,.55); font-family: ui-sans-serif,system-ui,sans-serif; }
      header, footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 16px 18px; }
      header { border-bottom: 1px solid #2b2e33; }
      header div, .token { display: flex; align-items: center; gap: 12px; min-width: 0; }
      header img { width: 28px; height: 28px; border-radius: 7px; }
      h1, h2, p { margin: 0; }
      h1 { font-size: 17px; }
      h2 { font-size: 15px; }
      main { display: grid; gap: 16px; padding: 18px; }
      .token img { width: 72px; height: 72px; flex: 0 0 auto; object-fit: cover; background: #111316; border-radius: 12px; }
      .token-copy { min-width: 0; }
      .token-copy h2, .token-copy p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .token-copy p, .note, .status { color: #a7abb3; font-size: 12px; line-height: 1.5; }
      .promise { padding: 12px; color: #d7f8e5; background: #163126; border-radius: 10px; font-size: 13px; line-height: 1.45; }
      .purchase { display: grid; grid-template-columns: minmax(0, 1fr) 150px; align-items: end; gap: 12px; padding: 12px; background: #1c1f23; border: 1px solid #30343a; border-radius: 10px; }
      .purchase-copy { display: grid; gap: 3px; }
      .purchase-copy strong { font-size: 13px; }
      details { padding-top: 12px; border-top: 1px solid #30333a; }
      summary { cursor: pointer; font-size: 13px; font-weight: 700; }
      .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
      label { display: grid; gap: 6px; color: #c8cbd1; font-size: 12px; }
      .wide { grid-column: 1 / -1; }
      input, textarea { width: 100%; color: #f3f4f6; background: #111316; border: 1px solid #383b42; border-radius: 8px; padding: 9px 10px; font: 13px/1.35 inherit; }
      textarea { min-height: 72px; resize: vertical; }
      input[type="checkbox"] { width: auto; }
      .upload { position: relative; display: inline-grid; place-items: center; width: max-content; min-height: 34px; padding: 0 11px; background: #202227; border: 1px solid #363940; border-radius: 8px; cursor: pointer; }
      .upload input { position: absolute; width: 1px; height: 1px; opacity: 0; }
      button { min-height: 34px; color: #d8dbe0; background: #202227; border: 1px solid #363940; border-radius: 8px; cursor: pointer; }
      button:disabled { cursor: not-allowed; opacity: .45; }
      button:focus-visible, input:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 2px solid #ff5964; outline-offset: 2px; }
      .close { width: 34px; }
      .deploy { min-width: 210px; min-height: 52px; padding: 0 24px; color: #fff; background: #a52331; border-color: #e05260; font-size: 14px; font-weight: 800; }
      .status.error { color: #ff8c94; }
      @media (max-width: 620px) { .backdrop { padding: 10px; } .dialog { width: calc(100vw - 20px); max-height: calc(100vh - 20px); } .fields, .purchase { grid-template-columns: 1fr; } .wide { grid-column: auto; } footer { align-items: stretch; flex-direction: column; } .deploy { width: 100%; } }
    </style>
    <div class="backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="pons-composer-title">
        <header><div><img src="${chrome.runtime.getURL("assets/vamp-128.png")}" alt=""><h1 id="pons-composer-title">Flip PONS Fees</h1></div><button class="close" type="button" aria-label="Close PONS Composer">×</button></header>
        <main>
          <div class="token"><img class="preview" src="${chrome.runtime.getURL("assets/vamp-128.png")}" alt="Copied token image"><div class="token-copy"><h2 data-token-name>Copied token</h2><p data-token-symbol></p></div></div>
          <p class="promise">The copied token launches through PONS V2, then its configurable creator-fee share is routed to holders.</p>
          <div class="purchase"><div class="purchase-copy"><strong>Creator purchase</strong><p class="note">Bought atomically for your signing wallet in the selected pair asset. Set to 0 to disable.</p></div><label>Amount<input name="creatorPurchase" type="number" min="0" step="any" inputmode="decimal" value="0.1"></label></div>
          <details><summary>Edit copied metadata</summary><div class="fields">
            <label>Name<input name="originalName"></label><label>Ticker<input name="originalSymbol"></label>
            <label class="wide">Description<textarea name="description"></textarea></label>
            <label class="wide">Website<input name="website" type="url"></label><label>X<input name="x"></label><label>Telegram<input name="telegram"></label>
            <label class="wide">Image URL<input name="imageUrl" type="url"></label><label class="upload">Upload replacement image<input name="imageUpload" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload replacement image"></label>
          </div></details>
          <details><summary>Advanced launch settings</summary><div class="fields">
            <label class="wide">Pair token address<input name="pairToken" spellcheck="false"></label>
            <label>Creator tax %<input name="creatorTaxPercent" type="number" min="0" max="10" step="0.01" value="0"></label>
            <label><span>Buyback vault</span><input name="buybackEnabled" type="checkbox"></label>
          </div></details>
        </main>
        <footer><p class="status" aria-live="polite">Copied metadata ready.</p><button class="deploy" type="button">Launch with holder fees</button></footer>
      </div>
    </div>`;
  document.body.append(host);

  const fields = new Map<MetadataField, HTMLInputElement | HTMLTextAreaElement>();
  for (const input of Array.from(shadow.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[name]"))) {
    if (["originalName", "originalSymbol", "description", "website", "x", "telegram", "imageUrl"].includes(input.name)) fields.set(input.name as MetadataField, input);
  }
  const preview = shadow.querySelector<HTMLImageElement>(".preview")!;
  const name = shadow.querySelector<HTMLElement>("[data-token-name]")!;
  const symbol = shadow.querySelector<HTMLElement>("[data-token-symbol]")!;
  const status = shadow.querySelector<HTMLElement>(".status")!;
  const deploy = shadow.querySelector<HTMLButtonElement>(".deploy")!;
  const close = shadow.querySelector<HTMLButtonElement>(".close")!;
  const pairToken = shadow.querySelector<HTMLInputElement>('[name="pairToken"]')!;
  const creatorTax = shadow.querySelector<HTMLInputElement>('[name="creatorTaxPercent"]')!;
  const creatorPurchase = shadow.querySelector<HTMLInputElement>('[name="creatorPurchase"]')!;
  const buyback = shadow.querySelector<HTMLInputElement>('[name="buybackEnabled"]')!;
  const upload = shadow.querySelector<HTMLInputElement>('[name="imageUpload"]')!;
  let invoker: HTMLButtonElement | null = null;
  let sourceImage: LaunchImageSource = { kind: "none" };
  let touched = new Set<MetadataField>();
  let sequence = 0;
  let busy = false;
  let recoveryUrl: string | null = null;

  for (const [field, control] of fields) control.addEventListener("input", () => { touched.add(field); syncPreview(); validate(); });
  for (const control of [pairToken, creatorTax, creatorPurchase]) control.addEventListener("input", validate);
  upload.addEventListener("change", () => {
    const file = upload.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) { status.textContent = "Use a PNG, JPEG, or WebP image smaller than 5 MB."; status.classList.add("error"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      sourceImage = { kind: "uploaded-file", dataUrl: reader.result, mediaType: file.type, name: file.name };
      fields.get("imageUrl")!.value = reader.result;
      touched.add("imageUrl");
      syncPreview(); validate();
    };
    reader.readAsDataURL(file);
  });
  close.addEventListener("click", dismiss);
  shadow.querySelector(".backdrop")!.addEventListener("click", (event) => { if (event.target === event.currentTarget) dismiss(); });
  deploy.addEventListener("click", launch);
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (!busy || typeof message !== "object" || message === null || Reflect.get(message, "type") !== "vamp:launch-progress") return;
    const next = Reflect.get(message, "status");
    if (typeof next === "string") status.textContent = next;
  });

  return {
    open(button, source, copiedPairToken) {
      invoker = button;
      touched = new Set();
      const current = ++sequence;
      const metadata = metadataFromSource(source);
      for (const [field, value] of Object.entries(metadata) as Array<[MetadataField, string]>) fields.get(field)!.value = value;
      sourceImage = imageSourceFromUrl(metadata.imageUrl);
      pairToken.value = /^0x[0-9a-f]{40}$/i.test(copiedPairToken ?? "") ? copiedPairToken! : zeroAddress;
      creatorTax.value = "0";
      creatorPurchase.value = "0.1";
      buyback.checked = false;
      status.textContent = "Copied metadata ready.";
      status.classList.remove("error");
      recoveryUrl = null;
      deploy.textContent = "Launch with holder fees";
      host.hidden = false;
      syncPreview(); validate(); close.focus();
      void source.identity?.then((identity) => {
        if (current !== sequence || host.hidden) return;
        if (!touched.has("originalName")) fields.get("originalName")!.value = identity.name;
        if (!touched.has("originalSymbol")) fields.get("originalSymbol")!.value = identity.symbol;
        syncPreview(); validate();
      });
      void source.enrichment?.then((enrichment) => {
        if (current !== sequence || host.hidden) return;
        for (const [field, value] of Object.entries(enrichment) as Array<[MetadataField, string | undefined]>) {
          if (!value || touched.has(field)) continue;
          fields.get(field)!.value = value;
          if (field === "imageUrl") sourceImage = imageSourceFromUrl(value);
        }
        syncPreview(); validate();
      });
    },
    dismiss,
  };

  function dismiss(): void {
    if (busy) return;
    host.hidden = true;
    invoker?.focus();
    invoker = null;
  }

  function syncPreview(): void {
    const imageUrl = fields.get("imageUrl")!.value.trim();
    if (sourceImage.kind !== "uploaded-file") sourceImage = imageSourceFromUrl(imageUrl);
    preview.src = sourceImage.kind === "remote-url" ? sourceImage.url : imageUrl;
    name.textContent = fields.get("originalName")!.value.trim() || "Copied token";
    symbol.textContent = fields.get("originalSymbol")!.value.trim() ? `$${fields.get("originalSymbol")!.value.trim().toUpperCase()}` : "";
  }

  function validate(): boolean {
    const valid = !!fields.get("originalName")!.value.trim() && !!fields.get("originalSymbol")!.value.trim()
      && sourceImage.kind !== "none" && /^0x[0-9a-f]{40}$/i.test(pairToken.value.trim())
      && /^\d+(?:\.\d+)?$/.test(creatorPurchase.value.trim())
      && Number(creatorTax.value) >= 0 && Number(creatorTax.value) <= 10;
    deploy.disabled = busy || !valid;
    if (!busy) status.textContent = valid ? "Ready to launch. Holder fee sharing stays on." : "Add a name, ticker, image, and valid pair token.";
    return valid;
  }

  function launch(): void {
    if (recoveryUrl) { location.assign(recoveryUrl); return; }
    if (busy || !validate()) return;
    busy = true; deploy.disabled = true; close.disabled = true; status.classList.remove("error");
    const request: PonsLaunchRequest = {
      metadata: Object.fromEntries(Array.from(fields, ([field, control]) => [field, control.value])) as unknown as LaunchMetadataValues,
      imageSource: sourceImage,
      pairToken: pairToken.value.trim() as Address,
      creatorPurchase: creatorPurchase.value.trim(),
      creatorTaxBps: Math.round(Number(creatorTax.value) * 100),
      buybackEnabled: buyback.checked,
    };
    const send = () => chrome.runtime.sendMessage({ type: "vamp:launch-pons", requestId: crypto.randomUUID(), launch: request }, finish);
    if (sourceImage.kind === "remote-url") {
      status.textContent = "Requesting access to copy the source image…";
      chrome.runtime.sendMessage({ type: "vamp:request-image-origin", url: sourceImage.url }, (response: unknown) => {
        if (!chrome.runtime.lastError && typeof response === "object" && response !== null && Reflect.get(response, "ok") === true) send();
        else {
          const detail = chrome.runtime.lastError?.message ?? (typeof response === "object" && response !== null ? Reflect.get(response, "error") : undefined);
          fail(typeof detail === "string" ? detail : "Image-host access is required to copy this token image.");
        }
      });
    } else send();
  }

  function finish(response: unknown): void {
    if (typeof response === "object" && response !== null && Reflect.get(response, "ok") === true) {
      const url = Reflect.get(response, "navigationUrl");
      if (typeof url === "string") location.assign(url);
      return;
    }
    if (typeof response === "object" && response !== null && Reflect.get(response, "launched") === true && typeof Reflect.get(response, "navigationUrl") === "string") {
      busy = false;
      close.disabled = false;
      recoveryUrl = String(Reflect.get(response, "navigationUrl"));
      status.textContent = typeof Reflect.get(response, "error") === "string" ? String(Reflect.get(response, "error")) : "The token launched, but holder fee sharing must be finished on PONS.";
      status.classList.add("error");
      deploy.textContent = "Open PONS token to finish";
      deploy.disabled = false;
      return;
    }
    fail(typeof response === "object" && response !== null && typeof Reflect.get(response, "error") === "string" ? String(Reflect.get(response, "error")) : "PONS launch failed. Your edits are preserved.");
  }

  function fail(message: string): void {
    busy = false; close.disabled = false; validate(); status.textContent = message; status.classList.add("error");
  }
}

function metadataFromSource(source: ResolvedSourceToken): LaunchMetadataValues {
  return {
    originalName: source.context.originalName || source.context.translatedName || "",
    originalSymbol: source.context.originalSymbol || source.context.translatedSymbol || "",
    imageUrl: source.context.imageUrl,
    description: source.context.description,
    website: source.context.website,
    x: source.context.x,
    telegram: source.context.telegram,
  };
}

function imageSourceFromUrl(url: string): LaunchImageSource {
  const value = url.trim();
  if (!value) return { kind: "none" };
  return { kind: "remote-url", url: value.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${value.slice(7)}` : value };
}
