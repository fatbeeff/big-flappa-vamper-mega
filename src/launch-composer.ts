import {
  FLAP_MINIMUM_DIVIDEND_BALANCE_TOKENS,
  validateLaunchMechanics,
  type LaunchMechanicsField,
  type LaunchMechanicsFormValues,
  type LaunchMechanicsValidation,
  type ResolvedLaunchMechanics,
} from "./launch-mechanics";
import { getComposerPaymentAssets, paymentAssetLabel } from "./payment-assets";
import type { PaymentAsset } from "./payment-assets";
import type {
  LaunchImageSource,
  LaunchMetadataValues,
} from "./launch-context";
import type { ResolvedSourceToken } from "./gmgn-source-token";
import type { FlapLaunchRequest } from "./flap-contract";
import type { FlapTaxInfo } from "./flap-tax-info";

type MetadataField = keyof LaunchMetadataValues;

export interface LaunchComposer {
  open(invoker: HTMLButtonElement, sourceToken: ResolvedSourceToken, options: LaunchComposerOpenOptions): void;
  dismiss(): void;
  readDraft(sourceAddress: string): LaunchDraftSnapshot | undefined;
}

export type LaunchComposerOpenOptions = {
  kind: "flip-tax";
  sourceTaxInfo: FlapTaxInfo;
};

export type LaunchDraftSnapshot = {
  sourceAddress: string;
  metadata: LaunchMetadataValues;
  imageSource: LaunchImageSource;
  mechanics: ResolvedLaunchMechanics | null;
  mechanicsValidation: LaunchMechanicsValidation;
};

type LaunchDraft = LaunchDraftSnapshot & {
  mode: "flip-tax";
  sourceTaxInfo: FlapTaxInfo;
  sourceImageSource: LaunchImageSource;
  touched: Set<MetadataField>;
  mechanicsValues?: LaunchMechanicsFormValues;
  paymentAssets?: readonly PaymentAsset[];
};

export function createLaunchComposer(): LaunchComposer {
  const host = document.createElement("div");
  host.dataset.vampLaunchComposer = "true";
  host.hidden = true;
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { position: fixed; inset: 0; z-index: 2147483647; }
      :host([hidden]) { display: none; }
      * { box-sizing: border-box; }
      .backdrop { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(4, 5, 7, .72); backdrop-filter: blur(3px); }
      .dialog { width: min(920px, calc(100vw - 48px)); max-height: calc(100vh - 48px); overflow: auto; color: #f3f4f6; background: #15171a; border: 1px solid #32353b; border-radius: 14px; box-shadow: 0 24px 80px rgba(0,0,0,.55); font-family: ui-sans-serif, system-ui, sans-serif; }
      header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid #2b2e33; }
      header div { display: flex; align-items: center; gap: 10px; }
      header img { width: 28px; height: 28px; border-radius: 7px; }
      h1 { margin: 0; font-size: 17px; }
      button { min-height: 32px; color: #c8cbd1; background: #202227; border: 1px solid #363940; border-radius: 8px; cursor: pointer; }
      button:disabled { cursor: not-allowed; opacity: .45; }
      button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid #ff5964; outline-offset: 2px; }
      .close { display: grid; place-items: center; width: 32px; height: 32px; }
      .columns { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(340px, .9fr); gap: 14px; padding: 18px; }
      section { min-height: 150px; padding: 16px; background: #1b1d21; border: 1px solid #2b2e33; border-radius: 10px; }
      h2 { margin: 0 0 12px; font-size: 14px; }
      p { margin: 0; color: #989da6; font-size: 12px; line-height: 1.5; }
      .translation { margin: -4px 0 12px; color: #b0b4bc; }
      .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      label { display: grid; gap: 6px; color: #c8cbd1; font-size: 12px; }
      label.wide { grid-column: 1 / -1; }
      input, textarea { width: 100%; color: #f3f4f6; background: #141619; border: 1px solid #383b42; border-radius: 7px; padding: 9px 10px; font: 13px/1.35 inherit; }
      textarea { min-height: 72px; resize: vertical; }
      .image-row { display: grid; grid-template-columns: 70px minmax(0, 1fr); align-items: start; gap: 12px; grid-column: 1 / -1; }
      .preview { display: block; width: 70px; height: 70px; object-fit: cover; background: #111316; border: 1px solid #383b42; border-radius: 9px; }
      .image-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; }
      .upload { position: relative; display: inline-grid; place-items: center; min-height: 32px; padding: 0 10px; background: #202227; border: 1px solid #363940; border-radius: 8px; cursor: pointer; }
      .upload input { position: absolute; width: 1px; height: 1px; opacity: 0; }
      .restore { padding: 0 10px; }
      .image-status { flex-basis: 100%; }
      [role="status"] { min-height: 18px; margin-bottom: 10px; color: #b0b4bc; }
      [data-launch-mechanics] { display: grid; gap: 8px; }
      .flip-tax-note { padding: 9px 10px; color: #ffd4d6; background: #36171c; border-radius: 8px; line-height: 1.45; }
      .mechanics-summary { color: #d8dbe0; line-height: 1.5; }
      .creator-purchase-picker { display: grid; gap: 8px; min-width: 0; margin: 3px 0 2px; padding: 11px; background: #17191d; border: 1px solid #34373d; border-radius: 9px; }
      .creator-purchase-picker[hidden] { display: none; }
      .creator-purchase-picker legend { padding: 0 5px; color: #f3f4f6; font-size: 12px; font-weight: 700; }
      .creator-purchase-presets { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; }
      .creator-purchase-presets button { min-width: 0; padding: 0 4px; color: #b8bbc2; font-size: 11px; font-variant-numeric: tabular-nums; }
      .creator-purchase-presets button[aria-pressed="true"] { color: #fff; background: #71222c; border-color: #d94752; }
      .creator-purchase-exact { grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; }
      .creator-purchase-exact span { color: #b8bbc2; white-space: nowrap; }
      .creator-purchase-exact input { min-width: 0; font-variant-numeric: tabular-nums; }
      .creator-purchase-help { color: #858a94; font-size: 10px; }
      details { border-top: 1px solid #30333a; padding-top: 10px; }
      summary { color: #f3f4f6; cursor: pointer; font-size: 12px; font-weight: 600; }
      .mechanics-fields { display: grid; gap: 14px; margin-top: 14px; }
      .mechanics-group { display: grid; gap: 9px; min-width: 0; padding: 0; border: 0; }
      .mechanics-group legend, .allocation-heading span { padding: 0; color: #d8dbe0; font-size: 12px; font-weight: 650; }
      .asset-picker { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
      .asset-option { position: relative; display: grid; grid-template-columns: 30px minmax(0, 1fr); align-items: center; gap: 8px; min-height: 48px; padding: 7px; color: #d8dbe0; background: #17191d; border: 1px solid #34373d; border-radius: 9px; cursor: pointer; }
      .asset-option:hover { border-color: #5a5e67; background: #1e2025; }
      .asset-option:has(input:checked) { color: #fff; background: #32191d; border-color: #c33a48; }
      .asset-option:has(input:focus-visible) { outline: 2px solid #ff5964; outline-offset: 2px; }
      .asset-option:has(input:disabled) { cursor: not-allowed; opacity: .42; }
      .asset-option input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
      .asset-mark { display: grid; place-items: center; width: 30px; height: 30px; color: #fff; background: #454953; border-radius: 50%; font-size: 9px; font-weight: 800; letter-spacing: -.01em; }
      .asset-option[data-category="crypto"] .asset-mark { background: #8f6915; }
      .asset-option[data-category="rwa"] .asset-mark { background: #394f74; }
      .asset-copy { min-width: 0; }
      .asset-symbol, .asset-label { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .asset-symbol { font-size: 11px; font-weight: 750; }
      .asset-label { margin-top: 2px; color: #9da2ac; font-size: 10px; }
      .slider-stack { display: grid; gap: 12px; }
      .slider-field { display: grid; gap: 6px; }
      .slider-label, .allocation-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
      .slider-label output, .allocation-heading output { color: #fff; font-variant-numeric: tabular-nums; font-weight: 700; }
      input[type="range"] { height: 18px; padding: 0; border: 0; background: transparent; accent-color: #d94752; cursor: ew-resize; }
      input[type="range"]::-webkit-slider-runnable-track { height: 4px; background: linear-gradient(90deg, #c33a48 var(--range-progress, 0%), #3a3d44 var(--range-progress, 0%)); border-radius: 2px; }
      input[type="range"]::-webkit-slider-thumb { width: 16px; height: 16px; margin-top: -6px; background: #f5f5f6; border: 3px solid #c33a48; border-radius: 50%; appearance: none; }
      .allocation-heading output.invalid { color: #ff8c94; }
      .allocation, .mechanics-status { grid-column: 1 / -1; }
      .field-error { min-height: 0; margin: 0; color: #ff8c94; font-size: 11px; }
      .mechanics-status { min-height: 18px; margin: 0; }
      .mechanics-status.invalid { color: #ff8c94; }
      .precision-field { display: grid; gap: 6px; }
      footer { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 0 18px 18px; }
      .launch-status { min-height: 18px; margin: 0; }
      .launch-status.error { color: #ff8c94; }
      .deploy { min-width: 220px; min-height: 56px; padding: 0 28px; color: #fff; background: #a52331; border-color: #e05260; font-size: 15px; font-weight: 800; letter-spacing: -.01em; transition: background-color 160ms ease-out, box-shadow 160ms ease-out, transform 160ms ease-out; }
      .deploy:not(:disabled) { box-shadow: 0 10px 30px rgba(217, 71, 82, .42), inset 0 1px 0 rgba(255,255,255,.16); }
      .deploy:not(:disabled):hover { background: #bd2d3c; box-shadow: 0 13px 36px rgba(217, 71, 82, .52), inset 0 1px 0 rgba(255,255,255,.2); transform: translateY(-1px); }
      .deploy:not(:disabled):active { background: #8f1d29; box-shadow: 0 5px 18px rgba(217, 71, 82, .34); transform: translateY(1px); }
      .deploy:disabled { box-shadow: none; }
      @media (max-width: 700px) { .backdrop { padding: 10px; } .dialog { width: calc(100vw - 20px); max-height: calc(100vh - 20px); } .columns, .fields { grid-template-columns: 1fr; } .wide, .image-row { grid-column: auto; } footer { grid-template-columns: 1fr; } .deploy { width: 100%; } }
    </style>
    <div class="backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="vamp-launch-composer-title">
        <header>
          <div><img src="${chrome.runtime.getURL("assets/vamp-128.png")}" alt=""><h1 id="vamp-launch-composer-title">Launch Composer</h1></div>
          <button class="close" type="button" aria-label="Close Launch Composer">×</button>
        </header>
        <div class="columns">
          <section aria-labelledby="vamp-metadata-heading">
            <h2 id="vamp-metadata-heading">Launch Metadata</h2>
            <p role="status" aria-live="polite"></p>
            <p class="translation" hidden></p>
            <details>
              <summary>Edit copied metadata</summary>
              <div class="fields">
              <label>Name<input name="originalName" autocomplete="off"></label>
              <label>Symbol<input name="originalSymbol" autocomplete="off"></label>
              <label class="wide">Description<textarea name="description"></textarea></label>
              <label class="wide">Website<input name="website" type="url" autocomplete="off"></label>
              <label>X<input name="x" type="url" autocomplete="off"></label>
              <label>Telegram<input name="telegram" type="url" autocomplete="off"></label>
              <div class="image-row">
                <img class="preview" src="${chrome.runtime.getURL("assets/vamp-128.png")}" alt="Token image preview" hidden>
                <div>
                  <label>Image URL<input name="imageUrl" type="url" autocomplete="off"></label>
                  <div class="image-actions">
                    <label class="upload">Upload image<input name="imageUpload" type="file" accept="image/*" aria-label="Upload image"></label>
                    <button class="restore" type="button" aria-label="Restore source image">Restore source</button>
                    <p class="image-status" aria-live="polite"></p>
                  </div>
                </div>
              </div>
              </div>
            </details>
          </section>
          <section aria-labelledby="vamp-mechanics-heading"><h2 id="vamp-mechanics-heading">Holder-Fee Correction</h2><div data-launch-mechanics><p>Loading source mechanics…</p></div></section>
        </div>
        <footer><p class="launch-status" aria-live="polite">Complete required fields to deploy.</p><button class="deploy" type="button" disabled>Deploy</button></footer>
      </div>
    </div>`;
  document.body.append(host);

  const closeButton = shadow.querySelector<HTMLButtonElement>(".close")!;
  const composerTitle = shadow.querySelector<HTMLElement>("#vamp-launch-composer-title")!;
  const composerIcon = shadow.querySelector<HTMLImageElement>("header img")!;
  const mechanicsHeading = shadow.querySelector<HTMLElement>("#vamp-mechanics-heading")!;
  const status = shadow.querySelector<HTMLElement>('[role="status"]')!;
  const translation = shadow.querySelector<HTMLElement>(".translation")!;
  const preview = shadow.querySelector<HTMLImageElement>(".preview")!;
  const imageStatus = shadow.querySelector<HTMLElement>(".image-status")!;
  const imageUpload = shadow.querySelector<HTMLInputElement>('input[name="imageUpload"]')!;
  const restoreButton = shadow.querySelector<HTMLButtonElement>(".restore")!;
  const deployButton = shadow.querySelector<HTMLButtonElement>(".deploy")!;
  const launchStatus = shadow.querySelector<HTMLElement>(".launch-status")!;
  const fields = new Map<MetadataField, HTMLInputElement | HTMLTextAreaElement>();
  for (const field of Array.from(shadow.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[name]:not([type=file]), textarea[name]"))) {
    fields.set(field.name as MetadataField, field);
  }

  let invoker: HTMLButtonElement | undefined;
  let activeDraft: LaunchDraft | undefined;
  let openSequence = 0;
  let ephemeralDraftSequence = 0;
  let launchInFlight = false;
  let launchRequestId: string | undefined;
  const drafts = new Map<string, LaunchDraft>();

  function setImageUrl(value: string): void {
    fields.get("imageUrl")!.value = value;
    if (value) {
      preview.src = value;
      preview.hidden = false;
    } else {
      preview.removeAttribute("src");
      preview.hidden = true;
    }
  }

  function setField(field: MetadataField, value: string): void {
    if (field === "imageUrl") setImageUrl(value);
    else fields.get(field)!.value = value;
  }

  for (const [name, field] of fields) {
    field.addEventListener("input", () => {
      if (!activeDraft) return;
      activeDraft.touched.add(name);
      activeDraft.metadata[name] = field.value;
      if (name === "imageUrl") {
        activeDraft.imageSource = imageSourceFromUrl(field.value);
        setImageUrl(field.value);
        imageStatus.textContent = "";
      }
      updateDeployState();
    });
  }

  restoreButton.addEventListener("click", () => {
    if (!activeDraft) return;
    activeDraft.touched.add("imageUrl");
    activeDraft.imageSource = activeDraft.sourceImageSource;
    activeDraft.metadata.imageUrl = imageSourceUrl(activeDraft.sourceImageSource);
    setImageUrl(activeDraft.metadata.imageUrl);
    imageStatus.textContent = "Source image restored.";
    updateDeployState();
  });

  imageUpload.addEventListener("change", () => {
    const file = imageUpload.files?.[0];
    const draft = activeDraft;
    const sequence = openSequence;
    if (!file || !draft) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (
        typeof reader.result !== "string"
        || sequence !== openSequence
        || draft !== activeDraft
        || host.hidden
      ) return;
      draft.touched.add("imageUrl");
      draft.imageSource = {
        kind: "uploaded-file",
        dataUrl: reader.result,
        mediaType: file.type,
        name: file.name,
      };
      draft.metadata.imageUrl = reader.result;
      setImageUrl(reader.result);
      imageStatus.textContent = "Uploaded image is ready to persist with this launch.";
      updateDeployState();
    });
    reader.addEventListener("error", () => {
      if (sequence !== openSequence || draft !== activeDraft || host.hidden) return;
      imageStatus.textContent = "The image could not be read. Captured values are unchanged.";
    });
    reader.readAsDataURL(file);
  });

  const dismiss = () => {
    if (host.hidden || launchInFlight) return;
    host.hidden = true;
    openSequence += 1;
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

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (!launchInFlight || typeof message !== "object" || message === null) return;
    if (Reflect.get(message, "type") !== "vamp:launch-progress" || Reflect.get(message, "requestId") !== launchRequestId) return;
    const next = Reflect.get(message, "status");
    if (typeof next === "string") launchStatus.textContent = next;
  });

  deployButton.addEventListener("click", () => {
    const draft = activeDraft;
    if (!draft || launchInFlight || !draft.mechanics || !draft.mechanicsValidation.valid) return;
    launchInFlight = true;
    launchRequestId = crypto.randomUUID();
    deployButton.disabled = true;
    closeButton.disabled = true;
    launchStatus.classList.remove("error");
    launchStatus.textContent = "Starting Flap preflight…";
    const launch: FlapLaunchRequest = {
      metadata: { ...draft.metadata },
      imageSource: { ...draft.imageSource },
      mechanics: structuredClone(draft.mechanics),
    };
    const broadcast = (): void => chrome.runtime.sendMessage({ type: "vamp:launch-token", requestId: launchRequestId, launch }, (response: unknown) => {
      launchInFlight = false;
      closeButton.disabled = false;
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        launchStatus.textContent = `Launch failed: ${runtimeError.message}. Your edits are preserved.`;
        launchStatus.classList.add("error");
        deployButton.disabled = false;
        return;
      }
      if (typeof response === "object" && response !== null && Reflect.get(response, "ok") === true) {
        const navigationUrl = Reflect.get(response, "navigationUrl");
        if (typeof navigationUrl === "string") window.location.assign(navigationUrl);
        return;
      }
      const error = typeof response === "object" && response !== null ? Reflect.get(response, "error") : undefined;
      launchStatus.textContent = typeof error === "string" ? error : "Launch failed. Your edits are preserved and ready to retry.";
      launchStatus.classList.add("error");
      deployButton.disabled = false;
    });
    if (launch.imageSource.kind === "remote-url") {
      launchStatus.textContent = "Requesting access to the public image host…";
      chrome.runtime.sendMessage({ type: "vamp:request-image-origin", url: launch.imageSource.url }, (response: unknown) => {
        const runtimeError = chrome.runtime.lastError;
        if (!runtimeError && typeof response === "object" && response !== null && Reflect.get(response, "ok") === true) {
          broadcast();
          return;
        }
        launchInFlight = false;
        closeButton.disabled = false;
        deployButton.disabled = false;
        const error = runtimeError?.message ?? (typeof response === "object" && response !== null ? Reflect.get(response, "error") : undefined);
        launchStatus.textContent = typeof error === "string" ? error : "Image-host access is required before Deploy.";
        launchStatus.classList.add("error");
      });
      return;
    }
    broadcast();
  });

  return {
    open(button, sourceToken, options) {
      const { context, identity, enrichment } = sourceToken;
      const mode = "flip-tax";
      invoker = button;
      imageStatus.textContent = "";
      const sourceKey = context.sourceAddress || `ephemeral:${++ephemeralDraftSequence}`;
      const draftKey = `flip-tax:${sourceKey}`;
      let draft = drafts.get(draftKey);
      if (!draft) {
        const sourceImageSource = imageSourceFromUrl(context.imageUrl);
        draft = {
          sourceAddress: context.sourceAddress,
          metadata: metadataFromContext(context),
          imageSource: sourceImageSource,
          sourceImageSource,
          mode,
          sourceTaxInfo: structuredClone(options.sourceTaxInfo),
          touched: new Set(),
          mechanics: null,
          mechanicsValidation: { valid: false, errors: {} },
        };
        drafts.set(draftKey, draft);
      } else {
        mergeMissingCapturedValues(draft, context);
        draft.sourceTaxInfo = structuredClone(options.sourceTaxInfo);
      }
      activeDraft = draft;
      host.dataset.composerMode = mode;
      composerTitle.textContent = "Flip Tax";
      composerIcon.src = chrome.runtime.getURL("assets/flip-tax.png");
      mechanicsHeading.textContent = "Holder-Fee Correction";
      renderDraft(draft);
      updateDeployState();
      restoreButton.disabled = draft.sourceImageSource.kind === "none";

      const translatedIdentity = [context.translatedName, context.translatedSymbol]
        .filter(Boolean)
        .join(" (");
      translation.textContent = translatedIdentity
        ? `GMGN translation: ${translatedIdentity}${context.translatedSymbol ? ")" : ""}`
        : "";
      translation.hidden = !translation.textContent;
      status.textContent = identity
        ? "Loading authoritative identity for a 100% holder-fee correction…"
        : "Copied metadata ready. Holders receive 100% of the configurable fees.";
      host.hidden = false;
      closeButton.focus();

      const sequence = ++openSequence;
      void renderMechanics(sequence);
      identity?.then(
        (resolvedIdentity) => {
          if (sequence !== openSequence || draft !== activeDraft || host.hidden) return;
          if (!draft.touched.has("originalName") && !draft.metadata.originalName) {
            draft.metadata.originalName = resolvedIdentity.name;
            setField("originalName", resolvedIdentity.name);
          }
          if (!draft.touched.has("originalSymbol") && !draft.metadata.originalSymbol) {
            draft.metadata.originalSymbol = resolvedIdentity.symbol;
            setField("originalSymbol", resolvedIdentity.symbol);
          }
          status.textContent = "Authoritative identity loaded. Ready to Flip Tax.";
        },
        () => {
          if (sequence !== openSequence || draft !== activeDraft || host.hidden) return;
          status.textContent = "Identity lookup failed. Captured metadata and the holder-fee correction are unchanged.";
        },
      );
      enrichment?.then(
        (values) => {
          if (sequence !== openSequence || draft !== activeDraft || host.hidden) return;
          for (const [field, value] of Object.entries(values) as Array<[MetadataField, string | null | undefined]>) {
            if (typeof value !== "string" || !value.trim()) continue;
            if (draft.touched.has(field) || draft.metadata[field]) continue;
            draft.metadata[field] = value;
            if (field === "imageUrl") {
              draft.imageSource = imageSourceFromUrl(value);
              if (draft.sourceImageSource.kind === "none") {
                draft.sourceImageSource = draft.imageSource;
                restoreButton.disabled = false;
              }
            }
            setField(field, value);
          }
        },
        () => {
          if (sequence !== openSequence || draft !== activeDraft || host.hidden || identity) return;
          status.textContent = "Some metadata could not be loaded. Captured values are unchanged.";
        },
      );
    },
    dismiss,
    readDraft(sourceAddress) {
      const draft = drafts.get(`flip-tax:${sourceAddress}`);
      return draft ? {
        sourceAddress: draft.sourceAddress,
        metadata: { ...draft.metadata },
        imageSource: { ...draft.imageSource },
        mechanics: draft.mechanics ? structuredClone(draft.mechanics) : null,
        mechanicsValidation: structuredClone(draft.mechanicsValidation),
      } : undefined;
    },
  };

  function updateDeployState(): void {
    const draft = activeDraft;
    const metadataValid = !!draft?.metadata.originalName.trim() && !!draft.metadata.originalSymbol.trim() && draft.imageSource.kind !== "none";
    const valid = !!draft?.mechanicsValidation.valid && !!draft.mechanics && metadataValid;
    deployButton.disabled = true;
    if (launchInFlight) return;
    launchStatus.classList.remove("error");
    if (!valid || !draft?.mechanics) {
      launchStatus.textContent = "Complete Flap-required metadata and mechanics to deploy.";
      return;
    }
    deployButton.disabled = false;
    launchStatus.textContent = "Deploy will open your browser wallet to connect and sign.";
  }

  function renderDraft(draft: LaunchDraft): void {
    for (const [field, value] of Object.entries(draft.metadata) as Array<[MetadataField, string]>) {
      setField(field, value);
    }
  }

  async function renderMechanics(sequence: number): Promise<void> {
    const paymentAssets = await getComposerPaymentAssets();
    const draft = activeDraft;
    if (sequence !== openSequence || host.hidden || !draft) return;
    const assets = [...paymentAssets];
    if (!draft.mechanicsValues) {
      draft.mechanicsValues = {
        paymentAssetId: "native-bnb",
        buyTaxPercent: "0",
        sellTaxPercent: "0",
        creatorFundsBps: "0",
        burnBps: "0",
        dividendBps: "10000",
        liquidityBps: "0",
        creatorPurchaseAmount: "0",
      };
      if (draft.sourceTaxInfo) {
        draft.mechanicsValues.buyTaxPercent = bpsPercent(draft.sourceTaxInfo.buyTaxBps);
        draft.mechanicsValues.sellTaxPercent = bpsPercent(draft.sourceTaxInfo.sellTaxBps);
        draft.mechanicsValues.creatorFundsBps = "0";
        draft.mechanicsValues.burnBps = "0";
        draft.mechanicsValues.dividendBps = "10000";
        draft.mechanicsValues.liquidityBps = "0";
        const quoteToken = draft.sourceTaxInfo.quoteToken.toLowerCase();
        let sourceAsset = assets.find((asset) => asset.address?.toLowerCase() === quoteToken);
        if (!sourceAsset) {
          sourceAsset = {
            id: `source-quote-${quoteToken}`,
            symbol: draft.sourceTaxInfo.quoteSymbol,
            label: "Source Token payment asset",
            category: "crypto",
            enabled: false,
            address: draft.sourceTaxInfo.quoteToken as `0x${string}`,
            unavailableReason: "The Source Token payment asset is not packaged with this extension. Choose a supported asset or update the extension.",
          };
          assets.unshift(sourceAsset);
        }
        draft.mechanicsValues.paymentAssetId = sourceAsset.id;
      }
    }
    draft.paymentAssets = assets;
    renderMechanicsEditor(draft);
  }

  function renderMechanicsEditor(draft: LaunchDraft): void {
    const container = shadow.querySelector<HTMLElement>("[data-launch-mechanics]")!;
    container.innerHTML = `
      <p class="flip-tax-note" hidden></p>
      <p class="mechanics-summary" data-mechanics-summary></p>
      <fieldset class="creator-purchase-picker" hidden>
        <legend>Creator purchase amount</legend>
        <div class="creator-purchase-presets">
          ${["0", "0.1", "0.25", "0.5", "1"].map((amount) => `<button type="button" data-creator-purchase="${amount}" aria-pressed="false">${amount}</button>`).join("")}
        </div>
        <label class="creator-purchase-exact"><input data-creator-purchase-input inputmode="decimal" aria-label="Exact creator purchase amount" aria-describedby="creator-purchase-help"><span data-creator-purchase-symbol></span></label>
        <p class="creator-purchase-help" id="creator-purchase-help">Spent from your connected browser wallet when you deploy.</p>
      </fieldset>
      <details>
        <summary>Edit Launch Mechanics</summary>
        <div class="mechanics-fields">
          <fieldset class="mechanics-group"><legend>Payment asset</legend><div class="asset-picker" data-payment-assets></div><p class="field-error" id="paymentAssetId-error"></p></fieldset>
          <fieldset class="mechanics-group"><legend>Trading tax</legend><div class="slider-stack">
            ${rangeControl("buyTaxPercent", "Buy tax", "Buy fee rate", 0, 10, 0.01, "buyTaxPercent-error tax-error")}
            ${rangeControl("sellTaxPercent", "Sell tax", "Sell fee rate", 0, 10, 0.01, "sellTaxPercent-error tax-error")}
          </div></fieldset>
          <p class="field-error allocation" id="tax-error"></p>
          <fieldset class="mechanics-group"><legend class="allocation-heading"><span>Tax allocation</span><output data-allocation-total>100% assigned</output></legend><div class="slider-stack">
            ${rangeControl("creatorFundsBps", "Creator funds", "Creator funds (bps)", 0, 10000, 1, "creatorFundsBps-error allocation-error")}
            ${rangeControl("burnBps", "Burn", "Burn (bps)", 0, 10000, 1, "burnBps-error allocation-error")}
            ${rangeControl("dividendBps", "Holders", "Dividend (bps)", 0, 10000, 1, "dividendBps-error allocation-error")}
            ${rangeControl("liquidityBps", "Liquidity", "Liquidity (bps)", 0, 10000, 1, "liquidityBps-error allocation-error")}
          </div></fieldset>
          <p class="field-error allocation" id="allocation-error"></p>
          <label class="precision-field">Creator purchase amount<input name="creatorPurchaseAmount" inputmode="decimal" aria-describedby="creatorPurchaseAmount-error"><p class="field-error" id="creatorPurchaseAmount-error"></p></label>
          <p class="mechanics-status" role="status" aria-live="polite"></p>
        </div>
      </details>`;
    const correctionNote = container.querySelector<HTMLElement>(".flip-tax-note")!;
    if (draft.mode === "flip-tax" && draft.sourceTaxInfo) {
      correctionNote.hidden = false;
      correctionNote.textContent = `Holder allocation ${bpsPercent(draft.sourceTaxInfo.dividendBps)}% → 100%. Source buy ${bpsPercent(draft.sourceTaxInfo.buyTaxBps)}% · sell ${bpsPercent(draft.sourceTaxInfo.sellTaxBps)}% preserved.`;
      container.querySelector<HTMLElement>("summary")!.textContent = "Review corrected mechanics";
    }

    const values = draft.mechanicsValues!;
    const assets = draft.paymentAssets ?? [];
    const creatorPurchasePicker = container.querySelector<HTMLFieldSetElement>(".creator-purchase-picker")!;
    const creatorPurchasePickerInput = container.querySelector<HTMLInputElement>("[data-creator-purchase-input]")!;
    const creatorPurchaseInput = container.querySelector<HTMLInputElement>('input[name="creatorPurchaseAmount"]')!;
    creatorPurchasePicker.hidden = draft.mode !== "flip-tax";
    const assetPicker = container.querySelector<HTMLElement>("[data-payment-assets]")!;
    assetPicker.replaceChildren(...assets.map((asset) => createAssetOption(asset, values.paymentAssetId)));
    if (!assets.some(({ id }) => id === values.paymentAssetId)) {
      assetPicker.prepend(createMissingAssetOption(values.paymentAssetId));
    }

    const fieldNames: Array<Exclude<keyof LaunchMechanicsFormValues, "paymentAssetId">> = [
      "buyTaxPercent", "sellTaxPercent", "creatorFundsBps", "burnBps", "dividendBps", "liquidityBps", "creatorPurchaseAmount",
    ];
    for (const name of fieldNames) container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value = values[name];

    const update = (): void => {
      values.paymentAssetId = container.querySelector<HTMLInputElement>('input[name="paymentAssetId"]:checked')?.value ?? values.paymentAssetId;
      for (const name of fieldNames) values[name] = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value;
      renderRangeValues(container);
      const validation = validateLaunchMechanics(values, assets);
      draft.mechanicsValidation = validation;
      draft.mechanics = validation.mechanics ? structuredClone(validation.mechanics) : null;
      renderMechanicsValidation(container, validation);
      container.querySelector<HTMLElement>("[data-mechanics-summary]")!.textContent = mechanicsSummary(values, assets);
      syncCreatorPurchasePicker(container, values, assets);
      updateDeployState();
    };
    assetPicker.addEventListener("change", update);
    for (const name of fieldNames) container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.addEventListener("input", update);
    creatorPurchasePickerInput.addEventListener("input", () => {
      creatorPurchaseInput.value = creatorPurchasePickerInput.value;
      update();
    });
    for (const preset of Array.from(container.querySelectorAll<HTMLButtonElement>("[data-creator-purchase]"))) {
      preset.addEventListener("click", () => {
        const amount = preset.dataset.creatorPurchase ?? "0";
        creatorPurchaseInput.value = amount;
        creatorPurchasePickerInput.value = amount;
        update();
      });
    }

    update();
  }
}

function syncCreatorPurchasePicker(container: HTMLElement, values: LaunchMechanicsFormValues, assets: readonly PaymentAsset[]): void {
  const input = container.querySelector<HTMLInputElement>("[data-creator-purchase-input]")!;
  input.value = values.creatorPurchaseAmount;
  const symbol = assets.find(({ id }) => id === values.paymentAssetId)?.symbol ?? "token";
  container.querySelector<HTMLElement>("[data-creator-purchase-symbol]")!.textContent = symbol;
  for (const preset of Array.from(container.querySelectorAll<HTMLButtonElement>("[data-creator-purchase]"))) {
    const selected = preset.dataset.creatorPurchase === values.creatorPurchaseAmount;
    preset.setAttribute("aria-pressed", String(selected));
    preset.setAttribute("aria-label", `${preset.dataset.creatorPurchase} ${symbol}`);
  }
}

function rangeControl(
  name: Exclude<keyof LaunchMechanicsFormValues, "paymentAssetId" | "creatorPurchaseAmount">,
  label: string,
  ariaLabel: string,
  min: number,
  max: number,
  step: number,
  describedBy: string,
): string {
  return `<label class="slider-field"><span class="slider-label"><span>${label}</span><output data-range-output="${name}"></output></span><input name="${name}" type="range" min="${min}" max="${max}" step="${step}" aria-label="${ariaLabel}" aria-describedby="${describedBy}"><p class="field-error" id="${name}-error"></p></label>`;
}

function createAssetOption(asset: PaymentAsset, selectedId: string): HTMLLabelElement {
  const option = document.createElement("label");
  option.className = "asset-option";
  option.dataset.category = asset.category;
  if (asset.unavailableReason) option.title = asset.unavailableReason;

  const input = document.createElement("input");
  input.type = "radio";
  input.name = "paymentAssetId";
  input.value = asset.id;
  input.checked = asset.id === selectedId;
  input.disabled = !asset.enabled;
  input.setAttribute("aria-describedby", "paymentAssetId-error");

  const mark = document.createElement("span");
  mark.className = "asset-mark";
  mark.ariaHidden = "true";
  mark.textContent = asset.symbol.slice(0, 4);
  const copy = document.createElement("span");
  copy.className = "asset-copy";
  const symbol = document.createElement("span");
  symbol.className = "asset-symbol";
  symbol.textContent = asset.symbol;
  const label = document.createElement("span");
  label.className = "asset-label";
  label.textContent = asset.enabled ? asset.label : `${asset.label} · unavailable`;
  copy.append(symbol, label);
  option.append(input, mark, copy);
  return option;
}

function createMissingAssetOption(assetId: string): HTMLLabelElement {
  return createAssetOption({ id: assetId, symbol: "?", label: "Unavailable asset", category: "crypto", enabled: false, unavailableReason: "This source asset is not packaged with this extension." }, assetId);
}

function renderRangeValues(container: HTMLElement): void {
  for (const name of ["buyTaxPercent", "sellTaxPercent"] as const) {
    const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    container.querySelector<HTMLOutputElement>(`[data-range-output="${name}"]`)!.value = `${Number(input.value)}%`;
    setRangeProgress(input);
  }
  for (const name of ["creatorFundsBps", "burnBps", "dividendBps", "liquidityBps"] as const) {
    const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    container.querySelector<HTMLOutputElement>(`[data-range-output="${name}"]`)!.value = `${formatPercent(Number(input.value) / 100)}%`;
    setRangeProgress(input);
  }
  const total = ["creatorFundsBps", "burnBps", "dividendBps", "liquidityBps"]
    .reduce((sum, name) => sum + Number(container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value), 0);
  const totalOutput = container.querySelector<HTMLOutputElement>("[data-allocation-total]")!;
  totalOutput.value = total === 10_000 ? "100% assigned" : `${formatPercent(total / 100)}% assigned`;
  totalOutput.classList.toggle("invalid", total !== 10_000);
}

function setRangeProgress(input: HTMLInputElement): void {
  const min = Number(input.min);
  const max = Number(input.max);
  const progress = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.setProperty("--range-progress", `${Math.max(0, Math.min(100, progress))}%`);
}

function formatPercent(value: number): string {
  return Number(value.toFixed(2)).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function mechanicsSummary(values: LaunchMechanicsFormValues, assets: readonly PaymentAsset[]): string {
  const allocation = `${values.creatorFundsBps}/${values.burnBps}/${values.dividendBps}/${values.liquidityBps} bps`;
  const paymentAsset = paymentAssetLabel(values.paymentAssetId, assets);
  const dividendPolicy = Number(values.dividendBps) > 0
    ? ` · Dividend ${paymentAsset} · ${Number(FLAP_MINIMUM_DIVIDEND_BALANCE_TOKENS).toLocaleString("en-US")}-token holder minimum`
    : "";
  return `${paymentAsset} · Buy tax ${values.buyTaxPercent}% · Sell tax ${values.sellTaxPercent}% · Allocation ${allocation}${dividendPolicy} · Creator purchase ${values.creatorPurchaseAmount}`;
}

function bpsPercent(bps: number): string {
  return String(Number((bps / 100).toFixed(2)));
}

function renderMechanicsValidation(container: HTMLElement, validation: LaunchMechanicsValidation): void {
  const fields: LaunchMechanicsField[] = [
    "paymentAssetId", "buyTaxPercent", "sellTaxPercent", "tax", "creatorFundsBps", "burnBps", "dividendBps", "liquidityBps", "allocation", "creatorPurchaseAmount",
  ];
  for (const field of fields) {
    container.querySelector<HTMLElement>(`#${field}-error`)!.textContent = validation.errors[field] ?? "";
    container.querySelectorAll<HTMLInputElement>(`[name="${field}"]`).forEach((control) => {
      control.setAttribute("aria-invalid", validation.errors[field] ? "true" : "false");
    });
  }
  const status = container.querySelector<HTMLElement>(".mechanics-status")!;
  const errorCount = Object.keys(validation.errors).length;
  status.textContent = validation.valid
    ? "Launch Mechanics satisfy Flap pre-broadcast requirements."
    : `Launch Mechanics need ${errorCount} correction${errorCount === 1 ? "" : "s"}.`;
  status.classList.toggle("invalid", !validation.valid);
}

function metadataFromContext(context: ResolvedSourceToken["context"]): LaunchMetadataValues {
  return {
    originalName: context.originalName,
    originalSymbol: context.originalSymbol,
    imageUrl: context.imageUrl,
    description: context.description,
    website: context.website,
    x: context.x,
    telegram: context.telegram,
  };
}

function mergeMissingCapturedValues(
  draft: LaunchDraft,
  context: ResolvedSourceToken["context"],
): void {
  const captured = metadataFromContext(context);
  for (const [field, value] of Object.entries(captured) as Array<[MetadataField, string]>) {
    if (!value || draft.metadata[field] || draft.touched.has(field)) continue;
    draft.metadata[field] = value;
    if (field === "imageUrl") {
      draft.imageSource = imageSourceFromUrl(value);
      if (draft.sourceImageSource.kind === "none") draft.sourceImageSource = draft.imageSource;
    }
  }
}

function imageSourceFromUrl(url: string): LaunchImageSource {
  return url ? { kind: "remote-url", url } : { kind: "none" };
}

function imageSourceUrl(source: LaunchImageSource): string {
  if (source.kind === "remote-url") return source.url;
  if (source.kind === "uploaded-file") return source.dataUrl;
  return "";
}
