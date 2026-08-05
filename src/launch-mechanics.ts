import type { LaunchMechanics } from "./launch-templates";
import type { PaymentAsset } from "./payment-assets";

export const FLAP_TAX_PERCENT_MAX = 10;
export const FLAP_ALLOCATION_TOTAL_BPS = 10_000;
export const FLAP_MINIMUM_DIVIDEND_BALANCE_TOKENS = "10000";

export type DividendPolicy = {
  dividendToken: "selected-payment-asset";
  minimumShareBalanceTokens: typeof FLAP_MINIMUM_DIVIDEND_BALANCE_TOKENS;
};

export type ResolvedLaunchMechanics = LaunchMechanics & {
  dividendPolicy: DividendPolicy | null;
};

export type LaunchMechanicsFormValues = {
  paymentAssetId: string;
  buyTaxPercent: string;
  sellTaxPercent: string;
  creatorFundsBps: string;
  burnBps: string;
  dividendBps: string;
  liquidityBps: string;
  creatorPurchaseAmount: string;
};

export type LaunchMechanicsField = keyof LaunchMechanicsFormValues | "allocation" | "tax";
export type LaunchMechanicsValidation = {
  valid: boolean;
  errors: Partial<Record<LaunchMechanicsField, string>>;
  mechanics?: ResolvedLaunchMechanics;
};

export function mechanicsFormValues(mechanics: LaunchMechanics): LaunchMechanicsFormValues {
  return {
    paymentAssetId: mechanics.paymentAssetId,
    buyTaxPercent: String(mechanics.buyTaxPercent),
    sellTaxPercent: String(mechanics.sellTaxPercent),
    creatorFundsBps: String(mechanics.allocationBps.creatorFunds),
    burnBps: String(mechanics.allocationBps.burn),
    dividendBps: String(mechanics.allocationBps.dividend),
    liquidityBps: String(mechanics.allocationBps.liquidity),
    creatorPurchaseAmount: mechanics.creatorPurchaseAmount,
  };
}

/**
 * Pre-broadcast validation for Flap Portal.newTokenV6 + TOKEN_TAXED_V3.
 *
 * Flap's official launcher exposes tax rates from 0–10%; the Portal interface
 * represents them as basis points, requires at least one positive rate for a
 * tax token, and requires the four standard allocation fields to total 10,000.
 * Creator-purchase limits are quote/balance dependent and are intentionally
 * deferred to the broadcast preflight; this seam only accepts a non-negative
 * decimal amount.
 */
export function validateLaunchMechanics(
  values: LaunchMechanicsFormValues,
  assets: readonly PaymentAsset[],
): LaunchMechanicsValidation {
  const errors: LaunchMechanicsValidation["errors"] = {};
  const selectedAsset = assets.find(({ id }) => id === values.paymentAssetId);
  if (!selectedAsset?.enabled) {
    errors.paymentAssetId = selectedAsset?.unavailableReason
      ? `Payment asset unavailable: ${selectedAsset.unavailableReason}`
      : "Select an available payment asset.";
  }

  const buyTaxPercent = parseTax(values.buyTaxPercent, "Buy tax", "buyTaxPercent", errors);
  const sellTaxPercent = parseTax(values.sellTaxPercent, "Sell tax", "sellTaxPercent", errors);

  const creatorFunds = parseBps(values.creatorFundsBps, "Creator funds", "creatorFundsBps", errors);
  const burn = parseBps(values.burnBps, "Burn", "burnBps", errors);
  const dividend = parseBps(values.dividendBps, "Dividend", "dividendBps", errors);
  const liquidity = parseBps(values.liquidityBps, "Liquidity", "liquidityBps", errors);
  const creatorPurchaseAmount = values.creatorPurchaseAmount.trim();
  if (!/^\d+(\.\d+)?$/.test(creatorPurchaseAmount)) {
    errors.creatorPurchaseAmount = "Creator purchase must be a non-negative decimal amount, including 0.";
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  const mechanics: LaunchMechanics = {
      paymentAssetId: values.paymentAssetId,
      buyTaxPercent: buyTaxPercent!,
      sellTaxPercent: sellTaxPercent!,
      allocationBps: { creatorFunds: creatorFunds!, burn: burn!, dividend: dividend!, liquidity: liquidity! },
      creatorPurchaseAmount,
  };
  Object.assign(errors, launchMechanicsInvariantErrors(mechanics));
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, errors, mechanics: resolveLaunchMechanics(mechanics) };
}

export function assertLaunchMechanicsInvariants(mechanics: LaunchMechanics): void {
  const errors = launchMechanicsInvariantErrors(mechanics);
  const first = Object.values(errors)[0];
  if (first) throw new Error(first);
}

export function launchMechanicsFromResolved(mechanics: ResolvedLaunchMechanics): LaunchMechanics {
  const { dividendPolicy: _, ...persisted } = mechanics;
  return structuredClone(persisted);
}

function resolveLaunchMechanics(mechanics: LaunchMechanics): ResolvedLaunchMechanics {
  return {
    ...structuredClone(mechanics),
    dividendPolicy: mechanics.allocationBps.dividend > 0
      ? { dividendToken: "selected-payment-asset", minimumShareBalanceTokens: FLAP_MINIMUM_DIVIDEND_BALANCE_TOKENS }
      : null,
  };
}

function launchMechanicsInvariantErrors(mechanics: LaunchMechanics): LaunchMechanicsValidation["errors"] {
  const errors: LaunchMechanicsValidation["errors"] = {};
  for (const [field, value, label] of [
    ["buyTaxPercent", mechanics.buyTaxPercent, "Buy tax"],
    ["sellTaxPercent", mechanics.sellTaxPercent, "Sell tax"],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > FLAP_TAX_PERCENT_MAX || !/^\d+(\.\d{1,2})?$/.test(String(value))) {
      errors[field] = `${label} must be 0–10% in increments of 0.01%.`;
    }
  }
  if (!errors.buyTaxPercent && !errors.sellTaxPercent && mechanics.buyTaxPercent === 0 && mechanics.sellTaxPercent === 0) {
    errors.tax = "A Flap tax token requires buy tax or sell tax above 0%.";
  }
  const allocationEntries = [
    ["creatorFundsBps", mechanics.allocationBps.creatorFunds, "Creator funds"],
    ["burnBps", mechanics.allocationBps.burn, "Burn"],
    ["dividendBps", mechanics.allocationBps.dividend, "Dividend"],
    ["liquidityBps", mechanics.allocationBps.liquidity, "Liquidity"],
  ] as const;
  for (const [field, value, label] of allocationEntries) {
    if (!Number.isInteger(value) || value < 0 || value > FLAP_ALLOCATION_TOTAL_BPS) {
      errors[field] = `${label} allocation must be a whole number from 0 to 10,000 bps.`;
    }
  }
  if (allocationEntries.every(([field]) => !errors[field])) {
    const total = allocationEntries.reduce((sum, [, value]) => sum + value, 0);
    if (total !== FLAP_ALLOCATION_TOTAL_BPS) {
      errors.allocation = `Tax allocation must total 10,000 bps; current total is ${total.toLocaleString("en-US")} bps.`;
    }
  }
  if (!/^\d+(\.\d+)?$/.test(mechanics.creatorPurchaseAmount.trim())) {
    errors.creatorPurchaseAmount = "Creator purchase must be a non-negative decimal amount, including 0.";
  }
  return errors;
}

function parseTax(
  raw: string,
  label: string,
  field: "buyTaxPercent" | "sellTaxPercent",
  errors: LaunchMechanicsValidation["errors"],
): number | undefined {
  const normalized = raw.trim();
  const value = Number(normalized);
  if (!/^\d+(\.\d{1,2})?$/.test(normalized) || !Number.isFinite(value) || value < 0 || value > FLAP_TAX_PERCENT_MAX) {
    errors[field] = `${label} must be 0–10% in increments of 0.01%.`;
    return undefined;
  }
  return value;
}

function parseBps(
  raw: string,
  label: string,
  field: "creatorFundsBps" | "burnBps" | "dividendBps" | "liquidityBps",
  errors: LaunchMechanicsValidation["errors"],
): number | undefined {
  const value = Number(raw);
  if (raw.trim() === "" || !Number.isInteger(value) || value < 0 || value > FLAP_ALLOCATION_TOTAL_BPS) {
    errors[field] = `${label} allocation must be a whole number from 0 to 10,000 bps.`;
    return undefined;
  }
  return value;
}
