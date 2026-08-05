import { resolveErc20Identity } from "./bsc-rpc";
import { refreshPaymentAssetsIfStale } from "./payment-assets";
import { ensurePaymentAssetRefreshAlarm, PAYMENT_ASSET_ALARM_NAME } from "./payment-asset-scheduler";

// MV3 workers are disposable. Top-level execution happens on every worker start,
// so a cleared/missing alarm is repaired independently of install events.
void ensurePaymentAssetRefreshAlarm(chrome.alarms);

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isIdentityRequest(message)) return false;

  resolveErc20Identity(message.address).then(
    (identity) => sendResponse({ ok: true, identity }),
    () => sendResponse({ ok: false }),
  );
  return true;
});

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
