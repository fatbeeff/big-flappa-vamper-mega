import { resolveErc20Identity } from "./bsc-rpc";
import { refreshPaymentAssetsIfStale } from "./payment-assets";
import { ensurePaymentAssetRefreshAlarm, PAYMENT_ASSET_ALARM_NAME } from "./payment-asset-scheduler";
import { gmgnBscTokenUrl, type FlapLaunchRequest } from "./flap-contract";
import { checkLaunchReadiness, createProductionDependencies, launchFlapTaxToken } from "./flap-launch";
import { assertLaunchMechanicsInvariants } from "./launch-mechanics";

// MV3 workers are disposable. Top-level execution happens on every worker start,
// so a cleared/missing alarm is repaired independently of install events.
void ensurePaymentAssetRefreshAlarm(chrome.alarms);

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isReadinessRequest(message)) {
    void checkLaunchReadiness(message.launch).then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: launchErrorMessage(error) }),
    );
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
        const dependencies = await createProductionDependencies(message.launch, report);
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

  resolveErc20Identity(message.address).then(
    (identity) => sendResponse({ ok: true, identity }),
    () => sendResponse({ ok: false }),
  );
  return true;
});

let launchInFlight = false;

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

function isReadinessRequest(message: unknown): message is { type: "vamp:launch-readiness"; launch: FlapLaunchRequest } {
  return typeof message === "object" && message !== null
    && Reflect.get(message, "type") === "vamp:launch-readiness"
    && typeof Reflect.get(message, "launch") === "object"
    && Reflect.get(message, "launch") !== null;
}

function launchErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Launch failed. Your edits are preserved; retry when the connection is healthy.";
  if (/user rejected|denied transaction/i.test(error.message)) return "Launch signing was rejected. Your edits are preserved.";
  if (/timeout|timed out/i.test(error.message)) return error.message;
  if (/revert/i.test(error.message)) return `Flap rejected the launch: ${error.message}`;
  if (/fetch|network|HTTP|RPC|transport/i.test(error.message)) return `Connection failed: ${error.message}`;
  return error.message || "Launch failed. Your edits are preserved.";
}

function isIdentityRequest(message: unknown): message is { type: "vamp:resolve-source-token"; address: string } {
  return typeof message === "object"
    && message !== null
    && Reflect.get(message, "type") === "vamp:resolve-source-token"
    && typeof Reflect.get(message, "address") === "string";
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
