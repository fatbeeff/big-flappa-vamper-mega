import { resolveErc20Identity } from "./bsc-rpc";
import { refreshPaymentAssetsIfStale } from "./payment-assets";

const ALARM_NAME = "refresh-payment-assets";

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
  void chrome.alarms.create(ALARM_NAME, { periodInMinutes: 300 });
  void refreshPaymentAssetsIfStale();
});
chrome.runtime.onStartup.addListener(() => { void refreshPaymentAssetsIfStale(); });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void refreshPaymentAssetsIfStale();
});
