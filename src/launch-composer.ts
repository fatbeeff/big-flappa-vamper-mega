import { getActiveTemplate } from "./launch-templates";
import { paymentAssetLabel } from "./payment-assets";
import type {
  LaunchContext,
  LaunchMetadataEnrichment,
  LaunchMetadataValues,
} from "./launch-context";

type MetadataField = keyof LaunchMetadataValues;

export interface LaunchComposer {
  open(
    invoker: HTMLButtonElement,
    launchContext: LaunchContext,
    enrichment?: Promise<LaunchMetadataEnrichment>,
  ): void;
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
  const fields = new Map<MetadataField, HTMLInputElement | HTMLTextAreaElement>();
  for (const field of Array.from(shadow.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[name]:not([type=file]), textarea[name]"))) {
    fields.set(field.name as MetadataField, field);
  }

  let invoker: HTMLButtonElement | undefined;
  let sourceImageUrl = "";
  let touched = new Set<MetadataField>();
  let openSequence = 0;

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
      touched.add(name);
      if (name === "imageUrl") {
        setImageUrl(field.value);
        imageStatus.textContent = "";
      }
    });
  }

  restoreButton.addEventListener("click", () => {
    touched.add("imageUrl");
    setImageUrl(sourceImageUrl);
    imageStatus.textContent = "Source image restored.";
  });

  imageUpload.addEventListener("change", () => {
    const file = imageUpload.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") return;
      touched.add("imageUrl");
      setImageUrl(reader.result);
      imageStatus.textContent = "Uploaded image is ready to persist with this launch.";
    });
    reader.addEventListener("error", () => {
      imageStatus.textContent = "The image could not be read. Captured values are unchanged.";
    });
    reader.readAsDataURL(file);
  });

  const dismiss = () => {
    if (host.hidden) return;
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

  return {
    open(button, launchContext, enrichment) {
      invoker = button;
      touched = new Set();
      imageStatus.textContent = "";
      sourceImageUrl = launchContext.imageUrl;
      restoreButton.disabled = !sourceImageUrl;
      setField("originalName", launchContext.originalName);
      setField("originalSymbol", launchContext.originalSymbol);
      setField("imageUrl", launchContext.imageUrl);
      setField("description", launchContext.description);
      setField("website", launchContext.website);
      setField("x", launchContext.x);
      setField("telegram", launchContext.telegram);

      const translatedIdentity = [launchContext.translatedName, launchContext.translatedSymbol]
        .filter(Boolean)
        .join(" (");
      translation.textContent = translatedIdentity
        ? `GMGN translation: ${translatedIdentity}${launchContext.translatedSymbol ? ")" : ""}`
        : "";
      translation.hidden = !translation.textContent;
      status.textContent = enrichment ? "Loading available metadata…" : "Captured metadata ready to edit.";
      host.hidden = false;
      closeButton.focus();

      const sequence = ++openSequence;
      void renderActiveTemplate(sequence);
      enrichment?.then(
        (values) => {
          if (sequence !== openSequence || host.hidden) return;
          for (const [field, value] of Object.entries(values) as Array<[MetadataField, string]>) {
            if (field === "imageUrl" && !sourceImageUrl) {
              sourceImageUrl = value;
              restoreButton.disabled = !value;
            }
            if (!touched.has(field)) setField(field, value);
          }
          status.textContent = "Available metadata loaded.";
        },
        () => {
          if (sequence !== openSequence || host.hidden) return;
          status.textContent = "Some metadata could not be loaded. Captured values are unchanged.";
        },
      );
    },
    dismiss,
  };

  async function renderActiveTemplate(sequence: number): Promise<void> {
    const template = await getActiveTemplate();
    if (sequence !== openSequence || host.hidden) return;
    const summary = shadow.querySelector<HTMLElement>("[data-active-template]")!;
    summary.replaceChildren();
    const label = document.createElement("p"); label.textContent = "Active Template";
    const name = document.createElement("strong"); name.textContent = template.name;
    const mechanics = document.createElement("p"); mechanics.textContent = `${paymentAssetLabel(template.mechanics.paymentAssetId)} · Buy tax ${template.mechanics.buyTaxPercent}% · Sell tax ${template.mechanics.sellTaxPercent}%`;
    summary.append(label, name, mechanics);
  }
}
