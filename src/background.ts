import { resolveErc20Identity } from "./bsc-rpc";
import { refreshPaymentAssetsIfStale } from "./payment-assets";
import { ensurePaymentAssetRefreshAlarm, PAYMENT_ASSET_ALARM_NAME } from "./payment-asset-scheduler";
import { flapPortalErrorMessage, gmgnBscTokenUrl, type FlapLaunchRequest } from "./flap-contract";
import { createProductionDependencies, launchFlapTaxToken, validatePublicHttpsImageUrl } from "./flap-launch";
import { assertLaunchMechanicsInvariants } from "./launch-mechanics";
import { inspectFlapTaxAddresses } from "./flap-tax-info";
import { inspectPonsTaxAddresses, ROBINHOOD_RPC_URL } from "./pons-tax-info";
import type { LongAuthenticityInfo } from "./long-authenticity";

// MV3 workers are disposable. Top-level execution happens on every worker start,
// so a cleared/missing alarm is repaired independently of install events.
void ensurePaymentAssetRefreshAlarm(chrome.alarms);

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isOfficialLaunchRequest(message)) {
    void chrome.tabs.create({ url: message.destination === "pons" ? "https://www.ponsfamily.com/launchpad/create" : "https://app.long.xyz/create" });
    sendResponse({ ok: true });
    return false;
  }
  if (isFlapTaxRequest(message)) {
    void inspectFlapTaxAddresses(message.addresses).then(
      (infoByAddress) => sendResponse({ ok: true, infoByAddress }),
      () => sendResponse({ ok: false }),
    );
    return true;
  }
  if (isPonsTaxRequest(message)) {
    void inspectPonsTaxAddresses(message.addresses).then(
      (infoByAddress) => sendResponse({ ok: true, infoByAddress }),
      () => sendResponse({ ok: false }),
    );
    return true;
  }
  if (isLongAuthenticityRequest(message)) {
    void inspectLongViaPage(message.addresses).then(
      (infoByAddress) => sendResponse({ ok: true, infoByAddress }),
      () => sendResponse({ ok: false }),
    );
    return true;
  }
  if (isImagePermissionRequest(message)) {
    try {
      const origin = validatePublicHttpsImageUrl(message.url).origin;
      const permission = { origins: [`${origin}/*`] };
      void chrome.permissions.contains(permission).then((alreadyGranted) => alreadyGranted || chrome.permissions.request(permission)).then(
        (granted) => sendResponse({ ok: granted, error: granted ? undefined : "Image-host access was not granted." }),
        () => sendResponse({ ok: false, error: "Image-host access could not be granted." }),
      );
    } catch (error) { sendResponse({ ok: false, error: launchErrorMessage(error) }); }
    return true;
  }
  if (isLaunchRequest(message)) {
    if (launchInFlight) {
      sendResponse({ ok: false, error: "A launch is already signing or broadcasting." });
      return false;
    }
    const tabId = _sender.tab?.id;
    launchInFlight = true;
    const report = (phase: string, status: string): void => {
      if (tabId !== undefined) void chrome.tabs.sendMessage(tabId, { type: "vamp:launch-progress", requestId: message.requestId, phase, status }).catch(() => undefined);
    };
    void (async () => {
      try {
        assertLaunchMechanicsInvariants(message.launch.mechanics);
        if (tabId === undefined) throw new Error("The launch tab is unavailable.");
        const dependencies = await createProductionDependencies(message.launch, report, injectedWalletProvider(tabId));
        const result = await launchFlapTaxToken(message.launch, dependencies);
        sendResponse({ ok: true, ...result, navigationUrl: gmgnBscTokenUrl(result.tokenAddress) });
      } catch (error) {
        sendResponse({ ok: false, error: launchErrorMessage(error) });
      } finally {
        launchInFlight = false;
      }
    })();
    return true;
  }

  if (!isIdentityRequest(message)) return false;

  resolveErc20Identity(message.address, message.network === "robinhood" ? ROBINHOOD_RPC_URL : undefined).then(
    (identity) => sendResponse({ ok: true, identity }),
    () => sendResponse({ ok: false }),
  );
  return true;
});

let launchInFlight = false;

function isOfficialLaunchRequest(message: unknown): message is { type: "vamp:open-official-launch"; destination: "long" | "pons" } {
  return typeof message === "object" && message !== null && Reflect.get(message, "type") === "vamp:open-official-launch"
    && ["long", "pons"].includes(String(Reflect.get(message, "destination")));
}

function isLaunchRequest(message: unknown): message is { type: "vamp:launch-token"; requestId: string; launch: FlapLaunchRequest } {
  if (typeof message !== "object" || message === null || Reflect.get(message, "type") !== "vamp:launch-token") return false;
  const launch = Reflect.get(message, "launch");
  return typeof Reflect.get(message, "requestId") === "string"
    && typeof launch === "object"
    && launch !== null
    && typeof Reflect.get(launch, "metadata") === "object"
    && typeof Reflect.get(launch, "mechanics") === "object"
    && typeof Reflect.get(launch, "imageSource") === "object";
}

function isFlapTaxRequest(message: unknown): message is { type: "vamp:inspect-flap-taxes"; addresses: string[] } {
  if (typeof message !== "object" || message === null || Reflect.get(message, "type") !== "vamp:inspect-flap-taxes") return false;
  const addresses = Reflect.get(message, "addresses");
  return Array.isArray(addresses) && addresses.length > 0 && addresses.length <= 36
    && addresses.every((address) => typeof address === "string" && /^0x[0-9a-f]{36}(?:7777|8888)$/i.test(address));
}

function isPonsTaxRequest(message: unknown): message is { type: "vamp:inspect-pons-taxes"; addresses: string[] } {
  if (typeof message !== "object" || message === null || Reflect.get(message, "type") !== "vamp:inspect-pons-taxes") return false;
  const addresses = Reflect.get(message, "addresses");
  return Array.isArray(addresses) && addresses.length > 0 && addresses.length <= 36
    && addresses.every((address) => typeof address === "string" && /^0x[0-9a-f]{40}$/i.test(address));
}

function isLongAuthenticityRequest(message: unknown): message is { type: "vamp:inspect-robinhood-long"; addresses: string[] } {
  if (typeof message !== "object" || message === null || Reflect.get(message, "type") !== "vamp:inspect-robinhood-long") return false;
  const addresses = Reflect.get(message, "addresses");
  return Array.isArray(addresses) && addresses.length > 0 && addresses.length <= 36
    && addresses.every((address) => typeof address === "string" && /^0x[0-9a-f]{40}$/i.test(address));
}

async function inspectLongViaPage(addresses: readonly string[]): Promise<Record<string, LongAuthenticityInfo>> {
  const existing = (await chrome.tabs.query({ url: "https://app.long.xyz/*" }))[0];
  const tab = existing ?? await chrome.tabs.create({ url: `https://app.long.xyz/tokens/${addresses[0]}`, active: false });
  if (tab.id === undefined) throw new Error("Long relay tab was not created");
  try {
    const response = await sendLongRelayRequest(tab.id, addresses);
    if (!isLongRelayResponse(response)) throw new Error("Long relay returned an invalid response");
    return Object.fromEntries(Object.entries(response.infoByAddress).map(([address, info]) => [address.toLowerCase(), info]));
  } finally {
    if (!existing) void chrome.tabs.remove(tab.id).catch(() => undefined);
  }
}

async function sendLongRelayRequest(tabId: number, addresses: readonly string[]): Promise<unknown> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { return await chrome.tabs.sendMessage(tabId, { type: "vamp:long-relay", addresses }); }
    catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  throw new Error("Long relay page did not become ready");
}

function isLongRelayResponse(value: unknown): value is { ok: true; infoByAddress: Record<string, LongAuthenticityInfo> } {
  return typeof value === "object" && value !== null && Reflect.get(value, "ok") === true
    && typeof Reflect.get(value, "infoByAddress") === "object" && Reflect.get(value, "infoByAddress") !== null;
}

function isImagePermissionRequest(message: unknown): message is { type: "vamp:request-image-origin"; url: string } {
  return typeof message === "object" && message !== null
    && Reflect.get(message, "type") === "vamp:request-image-origin"
    && typeof Reflect.get(message, "url") === "string";
}

function launchErrorMessage(error: unknown): string {
  const portalMessage = flapPortalErrorMessage(error);
  if (portalMessage) return portalMessage;
  if (!(error instanceof Error)) return "Launch failed. Your edits are preserved; retry when the connection is healthy.";
  if (/user rejected|denied transaction/i.test(error.message)) return "Launch signing was rejected. Your edits are preserved.";
  if (/timeout|timed out/i.test(error.message)) return error.message;
  if (/revert/i.test(error.message)) return `Flap rejected the launch: ${error.message}`;
  if (/fetch|network|HTTP|RPC|transport/i.test(error.message)) return `Connection failed: ${error.message}`;
  return error.message || "Launch failed. Your edits are preserved.";
}

function isIdentityRequest(message: unknown): message is { type: "vamp:resolve-source-token"; address: string; network: "bsc" | "robinhood" } {
  return typeof message === "object"
    && message !== null
    && Reflect.get(message, "type") === "vamp:resolve-source-token"
    && typeof Reflect.get(message, "address") === "string"
    && ["bsc", "robinhood"].includes(String(Reflect.get(message, "network")));
}

chrome.runtime.onInstalled.addListener(() => {
  void ensurePaymentAssetRefreshAlarm(chrome.alarms);
  void refreshPaymentAssetsIfStale();
});
chrome.runtime.onStartup.addListener(() => {
  void ensurePaymentAssetRefreshAlarm(chrome.alarms);
  void refreshPaymentAssetsIfStale();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PAYMENT_ASSET_ALARM_NAME) void refreshPaymentAssetsIfStale();
});

function injectedWalletProvider(tabId: number) {
  return {
    async request(args: { method: string; params?: unknown }): Promise<unknown> {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        args: [args],
        func: async (request) => {
          const provider = Reflect.get(window, "ethereum") as { request?(value: unknown): Promise<unknown> } | undefined;
          if (!provider?.request) return { ok: false, error: "No injected EVM wallet was found. Install or enable MetaMask, Rabby, or another browser wallet." };
          try { return { ok: true, value: await provider.request(request) }; }
          catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error), code: typeof error === "object" && error !== null ? Reflect.get(error, "code") : undefined }; }
        },
      });
      if (typeof result !== "object" || result === null || Reflect.get(result, "ok") !== true) {
        const error = new Error(String(typeof result === "object" && result !== null ? Reflect.get(result, "error") : "Injected wallet request failed."));
        Object.assign(error, { code: typeof result === "object" && result !== null ? Reflect.get(result, "code") : undefined });
        throw error;
      }
      return Reflect.get(result, "value");
    },
  };
}
