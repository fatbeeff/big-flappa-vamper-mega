import { deleteOperatorTemplate, exportOperatorTemplates, importOperatorTemplates, loadTemplateState, saveOperatorTemplate, selectActiveTemplate, type LaunchTemplate, type TemplateState } from "./launch-templates";
import { BUNDLED_PAYMENT_ASSETS, isPaymentAssetCacheStale, loadPaymentAssetCache, paymentAssetLabel, refreshPaymentAssetCache, refreshPaymentAssetsIfStale, type PaymentAsset, type PaymentAssetCache } from "./payment-assets";

const version = document.querySelector<HTMLElement>("#extension-version");
const list = required<HTMLElement>("#template-list");
const form = required<HTMLFormElement>("#template-form");
const statusMessage = required<HTMLElement>("#template-status");
const importInput = required<HTMLInputElement>("#template-import");
const paymentAsset = required<HTMLSelectElement>("#payment-asset");
let state: TemplateState;
let editingId: string | undefined;
let cachedAssets: readonly PaymentAsset[] = BUNDLED_PAYMENT_ASSETS;

if (version) version.textContent = chrome.runtime.getManifest().version;
void initialize();

required<HTMLButtonElement>("#create-template").addEventListener("click", () => openForm());
required<HTMLButtonElement>("#cancel-template").addEventListener("click", closeForm);
required<HTMLButtonElement>("#export-templates").addEventListener("click", exportTemplates);
required<HTMLButtonElement>("#refresh-payment-assets").addEventListener("click", () => refreshAssets(true));
form.addEventListener("submit", saveTemplate);
importInput.addEventListener("change", importTemplates);

async function initialize(): Promise<void> {
  const cache = await loadPaymentAssetCache();
  renderPaymentAssets(cache);
  await refreshTemplates();
  if (isPaymentAssetCacheStale(cache)) void refreshAssets(false);
}

async function refreshTemplates(next?: TemplateState): Promise<void> { state = next ?? await loadTemplateState(); list.replaceChildren(...state.templates.map(renderTemplate)); }

function renderTemplate(template: LaunchTemplate): HTMLElement {
  const article = document.createElement("article");
  article.className = "template-card";
  article.setAttribute("aria-label", `${template.name} template`);
  const active = template.id === state.activeTemplateId;
  const allocation = template.mechanics.allocationBps;
  article.innerHTML = `<div class="template-title"><label><input type="radio" name="active-template" ${active ? "checked" : ""} aria-label="${escapeHtml(template.name)}, make Active Template"> <strong>${escapeHtml(template.name)}</strong></label><span>${template.source === "bundled" ? "Bundled" : "Operator"}</span>${active ? '<span class="active-badge">Active Template</span>' : ""}</div>
    <p>${escapeHtml(paymentAssetLabel(template.mechanics.paymentAssetId, cachedAssets))} · Buy tax ${template.mechanics.buyTaxPercent}% · Sell tax ${template.mechanics.sellTaxPercent}%</p>
    <p>Creator funds ${allocation.creatorFunds} bps · Burn ${allocation.burn} bps · Dividend ${allocation.dividend} bps · Liquidity ${allocation.liquidity} bps</p>
    <p>Creator purchase ${escapeHtml(template.mechanics.creatorPurchaseAmount)}</p>
    ${template.source === "operator" ? `<div class="template-actions"><button type="button" data-action="edit" aria-label="Edit ${escapeHtml(template.name)}">Edit</button><button type="button" data-action="delete" aria-label="Delete ${escapeHtml(template.name)}">Delete</button></div>` : ""}`;
  article.querySelector<HTMLInputElement>('input[type="radio"]')?.addEventListener("change", async () => { await refreshTemplates(await selectActiveTemplate(template.id)); announce("Active Template updated."); });
  article.querySelector<HTMLButtonElement>('[data-action="edit"]')?.addEventListener("click", () => openForm(template));
  article.querySelector<HTMLButtonElement>('[data-action="delete"]')?.addEventListener("click", async () => { await refreshTemplates(await deleteOperatorTemplate(template.id)); announce("Template deleted."); });
  return article;
}

function openForm(template?: LaunchTemplate): void {
  editingId = template?.id;
  required<HTMLElement>("#template-form-title").textContent = template ? "Edit Launch Template" : "Create Launch Template";
  setValue("template-name", template?.name ?? "");
  populatePaymentAssetSelect(template?.mechanics.paymentAssetId);
  setValue("buy-tax", String(template?.mechanics.buyTaxPercent ?? 0));
  setValue("sell-tax", String(template?.mechanics.sellTaxPercent ?? 0));
  setValue("creator-funds-allocation", String(template?.mechanics.allocationBps.creatorFunds ?? 10_000));
  setValue("burn-allocation", String(template?.mechanics.allocationBps.burn ?? 0));
  setValue("dividend-allocation", String(template?.mechanics.allocationBps.dividend ?? 0));
  setValue("liquidity-allocation", String(template?.mechanics.allocationBps.liquidity ?? 0));
  setValue("creator-purchase", template?.mechanics.creatorPurchaseAmount ?? "0");
  form.hidden = false;
  required<HTMLInputElement>("#template-name").focus();
}
function closeForm(): void { form.hidden = true; editingId = undefined; }

async function saveTemplate(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  try {
    const selected = cachedAssets.find(({ id }) => id === paymentAsset.value);
    if (!selected?.enabled) throw new Error("Select an enabled payment asset.");
    const next = await saveOperatorTemplate({ id: editingId ?? crypto.randomUUID(), name: value("template-name").trim(), mechanics: { paymentAssetId: paymentAsset.value, buyTaxPercent: Number(value("buy-tax")), sellTaxPercent: Number(value("sell-tax")), allocationBps: { creatorFunds: Number(value("creator-funds-allocation")), burn: Number(value("burn-allocation")), dividend: Number(value("dividend-allocation")), liquidity: Number(value("liquidity-allocation")) }, creatorPurchaseAmount: value("creator-purchase").trim() } });
    closeForm(); await refreshTemplates(next); announce("Template saved.");
  } catch (error) { announceFailure("Template not saved", error); }
}

function exportTemplates(): void { const blob = new Blob([JSON.stringify(exportOperatorTemplates(state), null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "gmgn-vamp-launch-templates-v2.json"; link.click(); URL.revokeObjectURL(link.href); announce("Templates exported."); }
async function importTemplates(): Promise<void> { const file = importInput.files?.[0]; importInput.value = ""; if (!file) return; try { const candidate = JSON.parse(await file.text()); await refreshTemplates(await importOperatorTemplates(candidate)); announce("Templates imported."); } catch (error) { announceFailure("Import failed", error); } }

async function refreshAssets(forced: boolean): Promise<void> {
  const button = required<HTMLButtonElement>("#refresh-payment-assets");
  button.disabled = true;
  if (forced) announceAssetStatus("Refreshing payment assets…");
  const cache = forced ? await refreshPaymentAssetCache() : await refreshPaymentAssetsIfStale();
  renderPaymentAssets(cache);
  await refreshTemplates();
  button.disabled = false;
  if (cache.lastRefreshError) announceAssetStatus(`Refresh failed: ${cache.lastRefreshError} Last valid assets retained.`, true);
  else announceAssetStatus(forced ? "Payment assets refreshed." : "Payment assets refreshed in the background.");
}

function renderPaymentAssets(cache: PaymentAssetCache): void {
  cachedAssets = cache.manifest.assets;
  const stale = isPaymentAssetCacheStale(cache);
  required<HTMLElement>("#payment-assets-cache-state").textContent = cache.refreshedAt
    ? `Cache ${stale ? "stale" : "fresh"} · last refreshed ${new Date(cache.refreshedAt).toLocaleString()}`
    : "Bundled manifest · not refreshed yet · stale";
  const groups = (["crypto", "rwa"] as const).map((category) => {
    const section = document.createElement("section"); section.className = "asset-group"; section.setAttribute("aria-label", `${category === "crypto" ? "Crypto" : "RWA"} registry assets`);
    const heading = document.createElement("h3"); heading.textContent = category === "crypto" ? "Crypto" : "RWA";
    const assetList = document.createElement("ul");
    for (const asset of cachedAssets.filter((item) => item.category === category)) {
      const item = document.createElement("li"); item.className = "asset-row";
      const identity = document.createElement("span"); identity.textContent = `${asset.symbol} · ${asset.label}`;
      const availability = document.createElement("span"); availability.className = `asset-state${asset.enabled ? "" : " unavailable"}`; availability.textContent = asset.enabled ? "Enabled" : `Unavailable${asset.unavailableReason ? `: ${asset.unavailableReason}` : ""}`;
      item.append(identity, availability); assetList.append(item);
    }
    section.append(heading, assetList); return section;
  });
  required<HTMLElement>("#payment-assets-list").replaceChildren(...groups);
  populatePaymentAssetSelect(paymentAsset.value || undefined);
}

function populatePaymentAssetSelect(selected?: string): void {
  const groups = (["crypto", "rwa"] as const).map((category) => {
    const group = document.createElement("optgroup"); group.label = category === "crypto" ? "Crypto" : "RWA";
    for (const asset of cachedAssets.filter((item) => item.category === category)) {
      const identity = asset.symbol === asset.label ? asset.label : `${asset.symbol} · ${asset.label}`;
      const option = new Option(`${identity}${asset.enabled ? "" : " — Unavailable"}`, asset.id); option.disabled = !asset.enabled; group.append(option);
    }
    return group;
  });
  paymentAsset.replaceChildren(...groups);
  if (selected && cachedAssets.some(({ id }) => id === selected)) paymentAsset.value = selected;
  if (!paymentAsset.value) paymentAsset.value = cachedAssets.find(({ enabled }) => enabled)?.id ?? "";
}

function announceFailure(prefix: string, error: unknown): void { announce(error instanceof Error ? `${prefix}: ${error.message}` : `${prefix}: invalid data.`, true); }
function announce(message: string, error = false): void { statusMessage.textContent = message; statusMessage.setAttribute("role", error ? "alert" : "status"); statusMessage.classList.toggle("error", error); }
function announceAssetStatus(message: string, error = false): void { const target = required<HTMLElement>("#payment-assets-status"); target.textContent = message; target.setAttribute("role", error ? "alert" : "status"); target.classList.toggle("error", error); }
function required<T extends Element>(selector: string): T { const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing popup element: ${selector}`); return element; }
function value(id: string): string { return required<HTMLInputElement>(`#${id}`).value; }
function setValue(id: string, next: string): void { required<HTMLInputElement>(`#${id}`).value = next; }
function escapeHtml(value: string): string { const span = document.createElement("span"); span.textContent = value; return span.innerHTML; }
