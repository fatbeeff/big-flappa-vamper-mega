export type AllocationBps = {
  creatorFunds: number;
  burn: number;
  dividend: number;
  liquidity: number;
};

export type LaunchMechanics = {
  paymentAssetId: string;
  buyTaxPercent: number;
  sellTaxPercent: number;
  allocationBps: AllocationBps;
  creatorPurchaseAmount: string;
};

export type LaunchTemplate = {
  id: string;
  name: string;
  mechanics: LaunchMechanics;
  source: "bundled" | "operator";
};

export type TemplateState = { activeTemplateId: string; templates: LaunchTemplate[] };
export type TemplateTransferDocument = {
  format: "gmgn-vamp-launch-templates";
  version: 2;
  activeTemplateId: string;
  templates: Array<Omit<LaunchTemplate, "source">>;
};

const STORAGE_KEY = "launchTemplateDocument";
const DEFAULT_ACTIVE_ID = "team-balanced-bnb";

export const BUNDLED_TEMPLATES: readonly LaunchTemplate[] = [
  bundledTemplate("team-balanced-bnb", "Balanced BNB", 2, 2),
  bundledTemplate("team-growth-bnb", "Growth BNB", 1, 5),
];

export async function loadTemplateState(): Promise<TemplateState> {
  const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  if (stored === undefined) return { activeTemplateId: DEFAULT_ACTIVE_ID, templates: cloneBundled() };
  try {
    const document = validateTransferDocument(stored);
    return mergeWithBundled(document);
  } catch {
    const repaired = repairStoredDocument(stored);
    return repaired ? mergeWithBundled(repaired) : { activeTemplateId: DEFAULT_ACTIVE_ID, templates: cloneBundled() };
  }
}

export async function getActiveTemplate(): Promise<LaunchTemplate> {
  const state = await loadTemplateState();
  return state.templates.find(({ id }) => id === state.activeTemplateId) ?? state.templates[0];
}

export async function saveOperatorTemplate(template: Omit<LaunchTemplate, "source">): Promise<TemplateState> {
  validateTemplate(template, "template");
  if (isBundledId(template.id)) throw new Error("Bundled Launch Templates cannot be edited.");
  const state = await loadTemplateState();
  const operator = state.templates.filter(({ source }) => source === "operator");
  const index = operator.findIndex(({ id }) => id === template.id);
  const storedTemplate: LaunchTemplate = { ...template, source: "operator" };
  if (index === -1) operator.push(storedTemplate);
  else operator[index] = storedTemplate;
  return persist(state.activeTemplateId, operator);
}

export async function deleteOperatorTemplate(id: string): Promise<TemplateState> {
  if (isBundledId(id)) throw new Error("Bundled Launch Templates cannot be deleted.");
  const state = await loadTemplateState();
  const operator = state.templates.filter((template) => template.source === "operator" && template.id !== id);
  return persist(state.activeTemplateId === id ? DEFAULT_ACTIVE_ID : state.activeTemplateId, operator);
}

export async function selectActiveTemplate(id: string): Promise<TemplateState> {
  const state = await loadTemplateState();
  if (!state.templates.some((template) => template.id === id)) throw new Error("Active Template does not exist.");
  return persist(id, state.templates.filter(({ source }) => source === "operator"));
}

export async function importOperatorTemplates(input: unknown): Promise<TemplateState> {
  const document = validateTransferDocument(input);
  return persist(document.activeTemplateId, document.templates.map((template) => ({ ...template, source: "operator" })));
}

export function exportOperatorTemplates(state: TemplateState): TemplateTransferDocument {
  return {
    format: "gmgn-vamp-launch-templates",
    version: 2,
    activeTemplateId: state.activeTemplateId,
    templates: state.templates
      .filter(({ source }) => source === "operator")
      .map(({ source: _, ...template }) => structuredClone(template)),
  };
}

export function validateTransferDocument(input: unknown): TemplateTransferDocument {
  if (!isRecord(input)) throw new Error("the file must contain a JSON object.");
  if (input.format !== "gmgn-vamp-launch-templates") throw new Error("the template format is incompatible.");
  if (input.version !== 2) throw new Error("the template version is incompatible.");
  assertExactKeys(input, ["format", "version", "activeTemplateId", "templates"], "document");
  if (!Array.isArray(input.templates)) throw new Error("templates must be an array.");
  const templates = input.templates.map((template, index) => validateTemplate(template, `templates[${index}]`));
  const ids = templates.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new Error("template IDs must be unique.");
  if (ids.some(isBundledId)) throw new Error("imports cannot replace bundled Launch Templates.");
  if (typeof input.activeTemplateId !== "string" || (!ids.includes(input.activeTemplateId) && !isBundledId(input.activeTemplateId))) {
    throw new Error("the Active Template must identify one imported or bundled template.");
  }
  return { format: input.format, version: input.version, activeTemplateId: input.activeTemplateId, templates };
}

function validateTemplate(input: unknown, path: string): Omit<LaunchTemplate, "source"> {
  if (!isRecord(input)) throw new Error(`${path} must be an object.`);
  assertExactKeys(input, ["id", "name", "mechanics"], path);
  if (typeof input.id !== "string" || input.id.trim() === "") throw new Error(`${path}.id is required.`);
  if (typeof input.name !== "string" || input.name.trim() === "") throw new Error(`${path}.name is required.`);
  if (!isRecord(input.mechanics)) throw new Error(`${path}.mechanics must be an object.`);
  const mechanics = input.mechanics;
  assertExactKeys(mechanics, ["paymentAssetId", "buyTaxPercent", "sellTaxPercent", "allocationBps", "creatorPurchaseAmount"], `${path}.mechanics`);
  if (typeof mechanics.paymentAssetId !== "string" || mechanics.paymentAssetId.trim() === "") throw new Error(`${path}.mechanics.paymentAssetId is required.`);
  const buyTaxPercent = percent(mechanics.buyTaxPercent, `${path}.mechanics.buyTaxPercent`);
  const sellTaxPercent = percent(mechanics.sellTaxPercent, `${path}.mechanics.sellTaxPercent`);
  if (!isRecord(mechanics.allocationBps)) throw new Error(`${path}.mechanics.allocationBps must be an object.`);
  assertExactKeys(mechanics.allocationBps, ["creatorFunds", "burn", "dividend", "liquidity"], `${path}.mechanics.allocationBps`);
  const allocationBps: AllocationBps = {
    creatorFunds: basisPoints(mechanics.allocationBps.creatorFunds, `${path}.mechanics.allocationBps.creatorFunds`),
    burn: basisPoints(mechanics.allocationBps.burn, `${path}.mechanics.allocationBps.burn`),
    dividend: basisPoints(mechanics.allocationBps.dividend, `${path}.mechanics.allocationBps.dividend`),
    liquidity: basisPoints(mechanics.allocationBps.liquidity, `${path}.mechanics.allocationBps.liquidity`),
  };
  if (typeof mechanics.creatorPurchaseAmount !== "string") throw new Error(`${path}.mechanics.creatorPurchaseAmount must be a string.`);
  const validated = { paymentAssetId: mechanics.paymentAssetId, buyTaxPercent, sellTaxPercent, allocationBps, creatorPurchaseAmount: mechanics.creatorPurchaseAmount };
  try { assertLaunchMechanicsInvariants(validated); }
  catch (error) { throw new Error(`${path}.mechanics: ${error instanceof Error ? error.message : "invalid Launch Mechanics."}`); }
  return { id: input.id, name: input.name, mechanics: validated };
}

async function persist(activeTemplateId: string, operatorTemplates: LaunchTemplate[]): Promise<TemplateState> {
  const document: TemplateTransferDocument = {
    format: "gmgn-vamp-launch-templates",
    version: 2,
    activeTemplateId,
    templates: operatorTemplates.map(({ source: _, ...template }) => structuredClone(template)),
  };
  validateTransferDocument(document);
  await chrome.storage.local.set({ [STORAGE_KEY]: document });
  return mergeWithBundled(document);
}

function mergeWithBundled(document: TemplateTransferDocument): TemplateState {
  return { activeTemplateId: document.activeTemplateId, templates: [...cloneBundled(), ...document.templates.map((template) => ({ ...structuredClone(template), source: "operator" as const }))] };
}

function repairStoredDocument(input: unknown): TemplateTransferDocument | null {
  if (!isRecord(input) || input.format !== "gmgn-vamp-launch-templates" || input.version !== 2 || !Array.isArray(input.templates)) return null;
  const templates: TemplateTransferDocument["templates"] = [];
  for (const candidate of input.templates) {
    try {
      const template = validateTemplate(candidate, "stored template");
      if (!isBundledId(template.id) && !templates.some(({ id }) => id === template.id)) templates.push(template);
    } catch { /* Drop only the invalid stored template. */ }
  }
  const requestedActive = typeof input.activeTemplateId === "string" ? input.activeTemplateId : DEFAULT_ACTIVE_ID;
  const activeTemplateId = isBundledId(requestedActive) || templates.some(({ id }) => id === requestedActive)
    ? requestedActive
    : DEFAULT_ACTIVE_ID;
  return { format: "gmgn-vamp-launch-templates", version: 2, activeTemplateId, templates };
}

function bundledTemplate(id: string, name: string, buyTaxPercent: number, sellTaxPercent: number): LaunchTemplate {
  const mechanics: LaunchMechanics = { paymentAssetId: "native-bnb", buyTaxPercent, sellTaxPercent, allocationBps: { creatorFunds: 10_000, burn: 0, dividend: 0, liquidity: 0 }, creatorPurchaseAmount: "0" };
  assertLaunchMechanicsInvariants(mechanics);
  return { id, name, source: "bundled", mechanics };
}
function cloneBundled(): LaunchTemplate[] { return BUNDLED_TEMPLATES.map((template) => structuredClone(template)); }
function isBundledId(id: string): boolean { return BUNDLED_TEMPLATES.some((template) => template.id === id); }
function percent(value: unknown, path: string): number { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path} must be a finite number.`); return value; }
function basisPoints(value: unknown, path: string): number { if (!Number.isInteger(value)) throw new Error(`${path} must be an integer.`); return value as number; }
function assertExactKeys(record: Record<string, unknown>, expected: string[], path: string): void { const unsupported = Object.keys(record).filter((key) => !expected.includes(key)); const missing = expected.filter((key) => !(key in record)); if (unsupported.length) throw new Error(`${path} contains unsupported fields: ${unsupported.join(", ")}.`); if (missing.length) throw new Error(`${path} is missing fields: ${missing.join(", ")}.`); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
import { assertLaunchMechanicsInvariants } from "./launch-mechanics";
