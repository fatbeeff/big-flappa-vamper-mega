import { deleteOperatorTemplate, exportOperatorTemplates, importOperatorTemplates, loadTemplateState, saveOperatorTemplate, selectActiveTemplate, type LaunchTemplate, type TemplateState } from "./launch-templates";
import { BUNDLED_PAYMENT_ASSETS, paymentAssetLabel } from "./payment-assets";

const version = document.querySelector<HTMLElement>("#extension-version");
const list = required<HTMLElement>("#template-list");
const form = required<HTMLFormElement>("#template-form");
const statusMessage = required<HTMLElement>("#template-status");
const importInput = required<HTMLInputElement>("#template-import");
const paymentAsset = required<HTMLSelectElement>("#payment-asset");
let state: TemplateState;
let editingId: string | undefined;

if (version) version.textContent = chrome.runtime.getManifest().version;
paymentAsset.replaceChildren(...BUNDLED_PAYMENT_ASSETS.map((asset) => new Option(asset.label, asset.id)));
void refresh();

required<HTMLButtonElement>("#create-template").addEventListener("click", () => openForm());
required<HTMLButtonElement>("#cancel-template").addEventListener("click", closeForm);
required<HTMLButtonElement>("#export-templates").addEventListener("click", exportTemplates);
form.addEventListener("submit", saveTemplate);
importInput.addEventListener("change", importTemplates);

async function refresh(next?: TemplateState): Promise<void> { state = next ?? await loadTemplateState(); list.replaceChildren(...state.templates.map(renderTemplate)); }

function renderTemplate(template: LaunchTemplate): HTMLElement {
  const article = document.createElement("article");
  article.className = "template-card";
  article.setAttribute("aria-label", `${template.name} template`);
  const active = template.id === state.activeTemplateId;
  const allocation = template.mechanics.allocationBps;
  article.innerHTML = `<div class="template-title"><label><input type="radio" name="active-template" ${active ? "checked" : ""} aria-label="${escapeHtml(template.name)}, make Active Template"> <strong>${escapeHtml(template.name)}</strong></label><span>${template.source === "bundled" ? "Bundled" : "Operator"}</span>${active ? '<span class="active-badge">Active Template</span>' : ""}</div>
    <p>${escapeHtml(paymentAssetLabel(template.mechanics.paymentAssetId))} · Buy tax ${template.mechanics.buyTaxPercent}% · Sell tax ${template.mechanics.sellTaxPercent}%</p>
    <p>Creator funds ${allocation.creatorFunds} bps · Burn ${allocation.burn} bps · Dividend ${allocation.dividend} bps · Liquidity ${allocation.liquidity} bps</p>
    <p>Creator purchase ${escapeHtml(template.mechanics.creatorPurchaseAmount)}</p>
    ${template.source === "operator" ? `<div class="template-actions"><button type="button" data-action="edit" aria-label="Edit ${escapeHtml(template.name)}">Edit</button><button type="button" data-action="delete" aria-label="Delete ${escapeHtml(template.name)}">Delete</button></div>` : ""}`;
  article.querySelector<HTMLInputElement>('input[type="radio"]')?.addEventListener("change", async () => { await refresh(await selectActiveTemplate(template.id)); announce("Active Template updated."); });
  article.querySelector<HTMLButtonElement>('[data-action="edit"]')?.addEventListener("click", () => openForm(template));
  article.querySelector<HTMLButtonElement>('[data-action="delete"]')?.addEventListener("click", async () => { await refresh(await deleteOperatorTemplate(template.id)); announce("Template deleted."); });
  return article;
}

function openForm(template?: LaunchTemplate): void {
  editingId = template?.id;
  required<HTMLElement>("#template-form-title").textContent = template ? "Edit Launch Template" : "Create Launch Template";
  setValue("template-name", template?.name ?? "");
  paymentAsset.value = template?.mechanics.paymentAssetId ?? BUNDLED_PAYMENT_ASSETS[0].id;
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
    const next = await saveOperatorTemplate({ id: editingId ?? crypto.randomUUID(), name: value("template-name").trim(), mechanics: { paymentAssetId: paymentAsset.value, buyTaxPercent: Number(value("buy-tax")), sellTaxPercent: Number(value("sell-tax")), allocationBps: { creatorFunds: Number(value("creator-funds-allocation")), burn: Number(value("burn-allocation")), dividend: Number(value("dividend-allocation")), liquidity: Number(value("liquidity-allocation")) }, creatorPurchaseAmount: value("creator-purchase").trim() } });
    closeForm(); await refresh(next); announce("Template saved.");
  } catch (error) { announceFailure("Template not saved", error); }
}

function exportTemplates(): void { const blob = new Blob([JSON.stringify(exportOperatorTemplates(state), null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "gmgn-vamp-launch-templates-v2.json"; link.click(); URL.revokeObjectURL(link.href); announce("Templates exported."); }
async function importTemplates(): Promise<void> { const file = importInput.files?.[0]; importInput.value = ""; if (!file) return; try { const candidate = JSON.parse(await file.text()); await refresh(await importOperatorTemplates(candidate)); announce("Templates imported."); } catch (error) { announceFailure("Import failed", error); } }
function announceFailure(prefix: string, error: unknown): void { announce(error instanceof Error ? `${prefix}: ${error.message}` : `${prefix}: invalid data.`, true); }
function announce(message: string, error = false): void { statusMessage.textContent = message; statusMessage.setAttribute("role", error ? "alert" : "status"); statusMessage.classList.toggle("error", error); }
function required<T extends Element>(selector: string): T { const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing popup element: ${selector}`); return element; }
function value(id: string): string { return required<HTMLInputElement>(`#${id}`).value; }
function setValue(id: string, next: string): void { required<HTMLInputElement>(`#${id}`).value = next; }
function escapeHtml(value: string): string { const span = document.createElement("span"); span.textContent = value; return span.innerHTML; }
