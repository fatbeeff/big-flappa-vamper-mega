import { getActiveTemplate, saveOperatorTemplate } from "./launch-templates";
import {
  FLAP_MINIMUM_DIVIDEND_BALANCE_TOKENS,
  launchMechanicsFromResolved,
  mechanicsFormValues,
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

type MetadataField = keyof LaunchMetadataValues;

export interface LaunchComposer {
  open(invoker: HTMLButtonElement, sourceToken: ResolvedSourceToken): void;
  dismiss(): void;
  readDraft(sourceAddress: string): LaunchDraftSnapshot | undefined;
}

export type LaunchDraftSnapshot = {
  sourceAddress: string;
  metadata: LaunchMetadataValues;
  imageSource: LaunchImageSource;
  mechanics: ResolvedLaunchMechanics | null;
  mechanicsValidation: LaunchMechanicsValidation;
};

type LaunchDraft = LaunchDraftSnapshot & {
  sourceImageSource: LaunchImageSource;
  touched: Set<MetadataField>;
  mechanicsValues?: LaunchMechanicsFormValues;
  activeTemplateName?: string;
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
      .dialog { width: min(920px, calc(100vw - 48px)); max-height: calc(100vh - 48px); overflow: auto; color: #f3f4f6; background: #15171a; border: 1px solid #32353b; border-radius: 14px; box-shadow: 0 24px 80px rgba(0,0,0,.55); font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid #2b2e33; }
      header div { display: flex; align-items: center; gap: 10px; }
      header img { width: 28px; height: 28px; border-radius: 7px; }
      h1 { margin: 0; font-size: 17px; }
      button { min-height: 32px; color: #c8cbd1; background: #202227; border: 1px solid #363940; border-radius: 8px; cursor: pointer; }
      button:disabled { cursor: not-allowed; opacity: .45; }
      button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid #ff5964; outline-offset: 2px; }
      .close { display: grid; place-items: center; width: 32px; height: 32px; }
      .columns { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(260px, .65fr); gap: 14px; padding: 18px; }
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
      [data-active-template] { display: grid; gap: 8px; }
      .template-kicker { color: #989da6; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
      .mechanics-summary { color: #d8dbe0; line-height: 1.5; }
      details { border-top: 1px solid #30333a; padding-top: 10px; }
      summary { color: #f3f4f6; cursor: pointer; font-size: 12px; font-weight: 600; }
      .mechanics-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
      .mechanics-fields label.wide, .allocation, .mechanics-status, .template-save { grid-column: 1 / -1; }
      select { width: 100%; color: #f3f4f6; background: #141619; border: 1px solid #383b42; border-radius: 7px; padding: 9px 10px; font: 13px/1.35 inherit; }
      select:focus-visible { outline: 2px solid #ff5964; outline-offset: 2px; }
      .field-error { min-height: 0; margin: 0; color: #ff8c94; font-size: 11px; }
      .mechanics-status { min-height: 18px; margin: 0; }
      .mechanics-status.invalid { color: #ff8c94; }
      .template-save { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; padding-top: 4px; }
      .template-save[hidden] { display: none; }
      .save-template { width: 100%; }
      .allocation-note { grid-column: 1 / -1; color: #989da6; }
      footer { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 0 18px 18px; }
      .launch-status { min-height: 18px; margin: 0; }
      .launch-status.error { color: #ff8c94; }
      .deploy { min-width: 150px; color: #fff; background: #8f1d29; border-color: #c33a48; font-weight: 700; }
      @media (max-width: 700px) { .columns, .fields { grid-template-columns: 1fr; } .wide, .image-row { grid-column: auto; } }
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
            <div class="fields">
              <label>Name<input name="originalName" autocomplete="off"></label>
              <label>Symbol<input name="originalSymbol" autocomplete="off"></label>
              <label class="wide">Description<textarea name="description"></textarea></label>
              <label class="wide">Website<input name="website" type="url" autocomplete="off"></label>
              <label>X<input name="x" type="url" autocomplete="off"></label>
              <label>Telegram<input name="telegram" type="url" autocomplete="off"></label>
              <div class="image-row">
                <img class="preview" alt="Token image preview">
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
          </section>
          <section aria-labelledby="vamp-mechanics-heading"><h2 id="vamp-mechanics-heading">Launch Mechanics</h2><div data-active-template><p>Loading Active Template…</p></div></section>
        </div>
        <footer><p class="launch-status" aria-live="polite">Complete required fields to deploy.</p><button class="deploy" type="button" disabled>Deploy</button></footer>
      </div>
    </div>`;
  document.body.append(host);

  const closeButton = shadow.querySelector<HTMLButtonElement>(".close")!;
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
  let readinessGeneration = 0;
  let readinessTimer: ReturnType<typeof setTimeout> | undefined;
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
    launchStatus.textContent = "Starting Flap preflightâ€¦";
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
      launchStatus.textContent = "Requesting access to the public image hostâ€¦";
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
    open(button, sourceToken) {
      const { context, identity, enrichment } = sourceToken;
      invoker = button;
      imageStatus.textContent = "";
      const draftKey = context.sourceAddress || `ephemeral:${++ephemeralDraftSequence}`;
      let draft = drafts.get(draftKey);
      if (!draft) {
        const sourceImageSource = imageSourceFromUrl(context.imageUrl);
        draft = {
          sourceAddress: context.sourceAddress,
          metadata: metadataFromContext(context),
          imageSource: sourceImageSource,
          sourceImageSource,
          touched: new Set(),
          mechanics: null,
          mechanicsValidation: { valid: false, errors: {} },
        };
        drafts.set(draftKey, draft);
      } else {
        mergeMissingCapturedValues(draft, context);
      }
      activeDraft = draft;
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
      status.textContent = identity ? "Loading original token identity…" : "Captured metadata ready to edit.";
      host.hidden = false;
      closeButton.focus();

      const sequence = ++openSequence;
      void renderActiveTemplate(sequence);
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
          status.textContent = "Authoritative token identity loaded.";
        },
        () => {
          if (sequence !== openSequence || draft !== activeDraft || host.hidden) return;
          status.textContent = "Original token identity could not be loaded. Captured metadata is unchanged.";
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
      const draft = drafts.get(sourceAddress);
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
    const generation = ++readinessGeneration;
    if (readinessTimer) clearTimeout(readinessTimer);
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
    launchStatus.textContent = "Checking Shared Deployment Wallet, balances, and payment assetâ€¦";
    const launch: FlapLaunchRequest = { metadata: { ...draft.metadata }, imageSource: { ...draft.imageSource }, mechanics: structuredClone(draft.mechanics) };
    readinessTimer = setTimeout(() => {
      chrome.runtime.sendMessage({ type: "vamp:launch-readiness", launch }, (response: unknown) => {
        if (generation !== readinessGeneration || host.hidden || launchInFlight) return;
        const runtimeError = chrome.runtime.lastError;
        const ok = !runtimeError && typeof response === "object" && response !== null && Reflect.get(response, "ok") === true;
        if (ok) {
          const navigationUrl = Reflect.get(response as object, "navigationUrl");
          if (typeof navigationUrl === "string") {
            launchStatus.textContent = "Confirmed launch found. Returning to GMGNâ€¦";
            window.location.assign(navigationUrl);
            return;
          }
          deployButton.disabled = false;
          launchStatus.textContent = "Ready to sign and broadcast with the Shared Deployment Wallet.";
          return;
        }
        const error = runtimeError?.message ?? (typeof response === "object" && response !== null ? Reflect.get(response, "error") : undefined);
        launchStatus.textContent = typeof error === "string" ? error : "Launch readiness could not be verified.";
        launchStatus.classList.add("error");
      });
    }, 120);
  }

  function renderDraft(draft: LaunchDraft): void {
    for (const [field, value] of Object.entries(draft.metadata) as Array<[MetadataField, string]>) {
      setField(field, value);
    }
  }

  async function renderActiveTemplate(sequence: number): Promise<void> {
    // Both reads are extension-local. Opening never waits for the registry.
    const [template, assets] = await Promise.all([getActiveTemplate(), getComposerPaymentAssets()]);
    const draft = activeDraft;
    if (sequence !== openSequence || host.hidden || !draft) return;
    if (!draft.mechanicsValues) draft.mechanicsValues = mechanicsFormValues(template.mechanics);
    draft.activeTemplateName ??= template.name;
    draft.paymentAssets = assets;
    renderMechanicsEditor(draft);
  }

  function renderMechanicsEditor(draft: LaunchDraft): void {
    const container = shadow.querySelector<HTMLElement>("[data-active-template]")!;
    container.innerHTML = `
      <span class="template-kicker">Active Template</span>
      <strong data-template-name></strong>
      <p class="mechanics-summary" data-mechanics-summary></p>
      <details>
        <summary>Edit Launch Mechanics</summary>
        <div class="mechanics-fields">
          <label class="wide">Payment asset<select name="paymentAssetId" aria-label="Payment quote asset" aria-describedby="paymentAssetId-error"></select><p class="field-error" id="paymentAssetId-error"></p></label>
          <label>Buy tax (%)<input name="buyTaxPercent" type="number" min="0" max="10" step="0.01" aria-label="Buy fee rate" aria-describedby="buyTaxPercent-error tax-error"><p class="field-error" id="buyTaxPercent-error"></p></label>
          <label>Sell tax (%)<input name="sellTaxPercent" type="number" min="0" max="10" step="0.01" aria-label="Sell fee rate" aria-describedby="sellTaxPercent-error tax-error"><p class="field-error" id="sellTaxPercent-error"></p></label>
          <p class="field-error allocation" id="tax-error"></p>
          <label>Creator funds (bps)<input name="creatorFundsBps" type="number" min="0" max="10000" step="1" aria-describedby="creatorFundsBps-error allocation-error"><p class="field-error" id="creatorFundsBps-error"></p></label>
          <label>Burn (bps)<input name="burnBps" type="number" min="0" max="10000" step="1" aria-describedby="burnBps-error allocation-error"><p class="field-error" id="burnBps-error"></p></label>
          <label>Dividend (bps)<input name="dividendBps" type="number" min="0" max="10000" step="1" aria-describedby="dividendBps-error allocation-error"><p class="field-error" id="dividendBps-error"></p></label>
          <label>Liquidity (bps)<input name="liquidityBps" type="number" min="0" max="10000" step="1" aria-describedby="liquidityBps-error allocation-error"><p class="field-error" id="liquidityBps-error"></p></label>
          <p class="allocation-note">Standard non-vault allocation must total 10,000 bps.</p>
          <p class="field-error allocation" id="allocation-error"></p>
          <label class="wide">Creator purchase<input name="creatorPurchaseAmount" inputmode="decimal" aria-describedby="creatorPurchaseAmount-error"><p class="field-error" id="creatorPurchaseAmount-error"></p></label>
          <p class="mechanics-status" role="status" aria-live="polite"></p>
          <button class="save-template" type="button">Save as Template</button>
          <form class="template-save" hidden>
            <label>Template name<input name="templateName" aria-label="Template title" autocomplete="off"></label>
            <button type="submit">Save</button>
            <button type="button" data-cancel-template>Cancel</button>
          </form>
        </div>
      </details>`;
    container.querySelector<HTMLElement>("[data-template-name]")!.textContent = draft.activeTemplateName ?? "Active Template";

    const values = draft.mechanicsValues!;
    const assets = draft.paymentAssets ?? [];
    const select = container.querySelector<HTMLSelectElement>('select[name="paymentAssetId"]')!;
    for (const category of ["crypto", "rwa"] as const) {
      const group = document.createElement("optgroup");
      group.label = category === "crypto" ? "Crypto" : "RWA";
      for (const asset of assets.filter((item) => item.category === category)) {
        const identity = asset.symbol === asset.label ? asset.label : `${asset.symbol} · ${asset.label}`;
        const option = new Option(`${identity}${asset.enabled ? "" : " — Unavailable"}`, asset.id);
        option.disabled = !asset.enabled;
        group.append(option);
      }
      select.append(group);
    }
    if (!assets.some(({ id }) => id === values.paymentAssetId)) {
      const missing = new Option(`${values.paymentAssetId} — Unavailable`, values.paymentAssetId, true, true);
      missing.disabled = true;
      select.prepend(missing);
    }
    select.value = values.paymentAssetId;

    const fieldNames: Array<Exclude<keyof LaunchMechanicsFormValues, "paymentAssetId">> = [
      "buyTaxPercent", "sellTaxPercent", "creatorFundsBps", "burnBps", "dividendBps", "liquidityBps", "creatorPurchaseAmount",
    ];
    for (const name of fieldNames) container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value = values[name];

    const update = (): void => {
      values.paymentAssetId = select.value;
      for (const name of fieldNames) values[name] = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value;
      const validation = validateLaunchMechanics(values, assets);
      draft.mechanicsValidation = validation;
      draft.mechanics = validation.mechanics ? structuredClone(validation.mechanics) : null;
      renderMechanicsValidation(container, validation);
      container.querySelector<HTMLElement>("[data-mechanics-summary]")!.textContent = mechanicsSummary(values, assets);
      container.querySelector<HTMLButtonElement>(".save-template")!.disabled = !validation.valid;
      updateDeployState();
    };
    select.addEventListener("change", update);
    for (const name of fieldNames) container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.addEventListener("input", update);

    const saveButton = container.querySelector<HTMLButtonElement>(".save-template")!;
    const saveForm = container.querySelector<HTMLFormElement>(".template-save")!;
    const templateName = saveForm.elements.namedItem("templateName") as HTMLInputElement;
    saveButton.addEventListener("click", () => {
      saveForm.hidden = false;
      templateName.focus();
    });
    container.querySelector<HTMLButtonElement>("[data-cancel-template]")!.addEventListener("click", () => {
      saveForm.hidden = true;
      templateName.value = "";
    });
    saveForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      update();
      const validation = draft.mechanicsValidation;
      const mechanicsStatus = container.querySelector<HTMLElement>(".mechanics-status")!;
      if (!validation.valid || !validation.mechanics) return;
      if (!templateName.value.trim()) {
        mechanicsStatus.textContent = "Enter a template name.";
        mechanicsStatus.classList.add("invalid");
        return;
      }
      try {
        await saveOperatorTemplate({
          id: crypto.randomUUID(),
          name: templateName.value.trim(),
          mechanics: launchMechanicsFromResolved(validation.mechanics),
        });
        saveForm.hidden = true;
        templateName.value = "";
        mechanicsStatus.textContent = "Launch Template saved. It is available in extension configuration.";
        mechanicsStatus.classList.remove("invalid");
      } catch (error) {
        mechanicsStatus.textContent = error instanceof Error
          ? `Launch Template not saved: ${error.message}`
          : "Launch Template not saved.";
        mechanicsStatus.classList.add("invalid");
      }
    });
    update();
  }
}

function mechanicsSummary(values: LaunchMechanicsFormValues, assets: readonly PaymentAsset[]): string {
  const allocation = `${values.creatorFundsBps}/${values.burnBps}/${values.dividendBps}/${values.liquidityBps} bps`;
  const paymentAsset = paymentAssetLabel(values.paymentAssetId, assets);
  const dividendPolicy = Number(values.dividendBps) > 0
    ? ` · Dividend ${paymentAsset} · ${Number(FLAP_MINIMUM_DIVIDEND_BALANCE_TOKENS).toLocaleString("en-US")}-token holder minimum`
    : "";
  return `${paymentAsset} · Buy tax ${values.buyTaxPercent}% · Sell tax ${values.sellTaxPercent}% · Allocation ${allocation}${dividendPolicy} · Creator purchase ${values.creatorPurchaseAmount}`;
}

function renderMechanicsValidation(container: HTMLElement, validation: LaunchMechanicsValidation): void {
  const fields: LaunchMechanicsField[] = [
    "paymentAssetId", "buyTaxPercent", "sellTaxPercent", "tax", "creatorFundsBps", "burnBps", "dividendBps", "liquidityBps", "allocation", "creatorPurchaseAmount",
  ];
  for (const field of fields) {
    container.querySelector<HTMLElement>(`#${field}-error`)!.textContent = validation.errors[field] ?? "";
    const control = container.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${field}"]`);
    if (control) control.setAttribute("aria-invalid", validation.errors[field] ? "true" : "false");
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
