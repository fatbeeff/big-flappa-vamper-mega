type LaunchMechanics = {
  paymentAsset: string;
  buyTaxPercent: number;
  sellTaxPercent: number;
  taxAllocationPercent: number;
  creatorPurchaseAmount: string;
};

type LaunchTemplate = { id: string; name: string; mechanics: LaunchMechanics };
type TemplateDocument = {
  format: "gmgn-vamp-launch-templates";
  version: 1;
  activeTemplateId: string;
  templates: LaunchTemplate[];
};

const STORAGE_KEY = "launchTemplateDocument";
const DEFAULT_DOCUMENT: TemplateDocument = {
  format: "gmgn-vamp-launch-templates",
  version: 1,
  activeTemplateId: "team-balanced-bnb",
  templates: [
    {
      id: "team-balanced-bnb",
      name: "Balanced BNB",
      mechanics: {
        paymentAsset: "BNB",
        buyTaxPercent: 2,
        sellTaxPercent: 2,
        taxAllocationPercent: 100,
        creatorPurchaseAmount: "0",
      },
    },
    {
      id: "team-zero-tax-bnb",
      name: "Zero-tax BNB",
      mechanics: {
        paymentAsset: "BNB",
        buyTaxPercent: 0,
        sellTaxPercent: 0,
        taxAllocationPercent: 100,
        creatorPurchaseAmount: "0",
      },
    },
  ],
};

const version = document.querySelector<HTMLElement>("#extension-version");
const list = required<HTMLElement>("#template-list");
const form = required<HTMLFormElement>("#template-form");
const statusMessage = required<HTMLElement>("#template-status");
const importInput = required<HTMLInputElement>("#template-import");
let documentState = structuredClone(DEFAULT_DOCUMENT);
let editingId: string | undefined;

if (version) version.textContent = chrome.runtime.getManifest().version;
void loadDocument().then((loaded) => {
  documentState = loaded;
  render();
});

required<HTMLButtonElement>("#create-template").addEventListener("click", () => openForm());
required<HTMLButtonElement>("#cancel-template").addEventListener("click", closeForm);
required<HTMLButtonElement>("#export-templates").addEventListener("click", exportTemplates);
form.addEventListener("submit", saveTemplate);
importInput.addEventListener("change", importTemplates);

async function loadDocument(): Promise<TemplateDocument> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (stored[STORAGE_KEY] === undefined) {
    await chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_DOCUMENT });
    return structuredClone(DEFAULT_DOCUMENT);
  }
  try {
    return validateDocument(stored[STORAGE_KEY]);
  } catch {
    return structuredClone(DEFAULT_DOCUMENT);
  }
}

function render(): void {
  list.replaceChildren(...documentState.templates.map(renderTemplate));
}

function renderTemplate(template: LaunchTemplate): HTMLElement {
  const article = document.createElement("article");
  article.className = "template-card";
  article.setAttribute("aria-label", `${template.name} template`);
  const isActive = template.id === documentState.activeTemplateId;
  article.innerHTML = `
    <div class="template-title">
      <label><input type="radio" name="active-template" ${isActive ? "checked" : ""} aria-label="${escapeHtml(template.name)}, make Active Template"> <strong>${escapeHtml(template.name)}</strong></label>
      ${isActive ? '<span class="active-badge">Active Template</span>' : ""}
    </div>
    <p>${escapeHtml(template.mechanics.paymentAsset)} · Buy tax ${template.mechanics.buyTaxPercent}% · Sell tax ${template.mechanics.sellTaxPercent}%</p>
    <p>Tax allocation ${template.mechanics.taxAllocationPercent}% · Creator purchase ${escapeHtml(template.mechanics.creatorPurchaseAmount)}</p>
    <div class="template-actions">
      <button type="button" data-action="edit" aria-label="Edit ${escapeHtml(template.name)}">Edit</button>
      <button type="button" data-action="delete" aria-label="Delete ${escapeHtml(template.name)}">Delete</button>
    </div>`;
  article.querySelector<HTMLInputElement>('input[type="radio"]')?.addEventListener("change", async () => {
    documentState.activeTemplateId = template.id;
    await persistAndRender("Active Template updated.");
  });
  article.querySelector<HTMLButtonElement>('[data-action="edit"]')?.addEventListener("click", () => openForm(template));
  article.querySelector<HTMLButtonElement>('[data-action="delete"]')?.addEventListener("click", async () => {
    documentState.templates = documentState.templates.filter(({ id }) => id !== template.id);
    if (documentState.templates.length === 0) {
      documentState = structuredClone(DEFAULT_DOCUMENT);
    } else if (documentState.activeTemplateId === template.id) {
      documentState.activeTemplateId = documentState.templates[0].id;
    }
    await persistAndRender("Template deleted.");
  });
  return article;
}

function openForm(template?: LaunchTemplate): void {
  editingId = template?.id;
  required<HTMLElement>("#template-form-title").textContent = template ? "Edit Launch Template" : "Create Launch Template";
  setValue("template-name", template?.name ?? "");
  setValue("payment-asset", template?.mechanics.paymentAsset ?? "BNB");
  setValue("buy-tax", String(template?.mechanics.buyTaxPercent ?? 0));
  setValue("sell-tax", String(template?.mechanics.sellTaxPercent ?? 0));
  setValue("tax-allocation", String(template?.mechanics.taxAllocationPercent ?? 100));
  setValue("creator-purchase", template?.mechanics.creatorPurchaseAmount ?? "0");
  form.hidden = false;
  required<HTMLInputElement>("#template-name").focus();
}

function closeForm(): void {
  form.hidden = true;
  editingId = undefined;
}

async function saveTemplate(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const template: LaunchTemplate = {
    id: editingId ?? crypto.randomUUID(),
    name: value("template-name").trim(),
    mechanics: {
      paymentAsset: value("payment-asset").trim(),
      buyTaxPercent: Number(value("buy-tax")),
      sellTaxPercent: Number(value("sell-tax")),
      taxAllocationPercent: Number(value("tax-allocation")),
      creatorPurchaseAmount: value("creator-purchase").trim(),
    },
  };
  validateTemplate(template, "template");
  const existingIndex = documentState.templates.findIndex(({ id }) => id === template.id);
  if (existingIndex === -1) documentState.templates.push(template);
  else documentState.templates[existingIndex] = template;
  closeForm();
  await persistAndRender("Template saved.");
}

function exportTemplates(): void {
  const blob = new Blob([JSON.stringify(documentState, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "gmgn-vamp-launch-templates-v1.json";
  link.click();
  URL.revokeObjectURL(link.href);
  announce("Templates exported.");
}

async function importTemplates(): Promise<void> {
  const file = importInput.files?.[0];
  importInput.value = "";
  if (!file) return;
  try {
    const candidate = validateDocument(JSON.parse(await file.text()));
    documentState = candidate;
    await chrome.storage.local.set({ [STORAGE_KEY]: documentState });
    render();
    announce("Templates imported.");
  } catch (error) {
    announce(error instanceof Error ? `Import failed: ${error.message}` : "Import failed: invalid JSON.", true);
  }
}

function validateDocument(input: unknown): TemplateDocument {
  if (!isRecord(input)) throw new Error("the file must contain a JSON object.");
  if (input.format !== "gmgn-vamp-launch-templates") throw new Error("the template format is incompatible.");
  if (input.version !== 1) throw new Error("the template version is incompatible.");
  assertExactKeys(input, ["format", "version", "activeTemplateId", "templates"], "document");
  if (!Array.isArray(input.templates) || input.templates.length === 0) throw new Error("at least one template is required.");
  const templates = input.templates.map((template, index) => validateTemplate(template, `templates[${index}]`));
  if (new Set(templates.map(({ id }) => id)).size !== templates.length) throw new Error("template IDs must be unique.");
  if (typeof input.activeTemplateId !== "string" || !templates.some(({ id }) => id === input.activeTemplateId)) {
    throw new Error("the Active Template must identify exactly one imported template.");
  }
  return { format: input.format, version: input.version, activeTemplateId: input.activeTemplateId, templates };
}

function validateTemplate(input: unknown, path: string): LaunchTemplate {
  if (!isRecord(input)) throw new Error(`${path} must be an object.`);
  assertExactKeys(input, ["id", "name", "mechanics"], path);
  if (typeof input.id !== "string" || input.id.trim() === "") throw new Error(`${path}.id is required.`);
  if (typeof input.name !== "string" || input.name.trim() === "") throw new Error(`${path}.name is required.`);
  if (!isRecord(input.mechanics)) throw new Error(`${path}.mechanics must be an object.`);
  assertExactKeys(input.mechanics, ["paymentAsset", "buyTaxPercent", "sellTaxPercent", "taxAllocationPercent", "creatorPurchaseAmount"], `${path}.mechanics`);
  const mechanics = input.mechanics;
  if (typeof mechanics.paymentAsset !== "string" || mechanics.paymentAsset.trim() === "") throw new Error(`${path}.mechanics.paymentAsset is required.`);
  const buyTaxPercent = validatePercent(mechanics.buyTaxPercent, `${path}.mechanics.buyTaxPercent`);
  const sellTaxPercent = validatePercent(mechanics.sellTaxPercent, `${path}.mechanics.sellTaxPercent`);
  const taxAllocationPercent = validatePercent(mechanics.taxAllocationPercent, `${path}.mechanics.taxAllocationPercent`);
  if (typeof mechanics.creatorPurchaseAmount !== "string" || !/^\d+(\.\d+)?$/.test(mechanics.creatorPurchaseAmount)) throw new Error(`${path}.mechanics.creatorPurchaseAmount must be a non-negative decimal string.`);
  return { id: input.id, name: input.name, mechanics: { paymentAsset: mechanics.paymentAsset, buyTaxPercent, sellTaxPercent, taxAllocationPercent, creatorPurchaseAmount: mechanics.creatorPurchaseAmount } };
}

function validatePercent(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${path} must be between 0 and 100.`);
  return value;
}

function assertExactKeys(record: Record<string, unknown>, expected: string[], path: string): void {
  const unsupported = Object.keys(record).filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !(key in record));
  if (unsupported.length > 0) throw new Error(`${path} contains unsupported fields: ${unsupported.join(", ")}.`);
  if (missing.length > 0) throw new Error(`${path} is missing fields: ${missing.join(", ")}.`);
}

async function persistAndRender(message: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: documentState });
  render();
  announce(message);
}

function announce(message: string, isError = false): void {
  statusMessage.textContent = message;
  statusMessage.setAttribute("role", isError ? "alert" : "status");
  statusMessage.classList.toggle("error", isError);
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing popup element: ${selector}`);
  return element;
}
function value(id: string): string { return required<HTMLInputElement>(`#${id}`).value; }
function setValue(id: string, next: string): void { required<HTMLInputElement>(`#${id}`).value = next; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function escapeHtml(value: string): string { const span = document.createElement("span"); span.textContent = value; return span.innerHTML; }
