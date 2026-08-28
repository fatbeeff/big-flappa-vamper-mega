import { LONG_API_KEY, LONG_CHAIN_ID, normalizeLongAuthenticity, type LongAuthenticityInfo } from "./long-authenticity";

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isRelayRequest(message)) return false;
  void inspect(message.addresses).then(
    (infoByAddress) => sendResponse({ ok: true, infoByAddress }),
    () => sendResponse({ ok: false }),
  );
  return true;
});

async function inspect(addresses: readonly string[]): Promise<Record<string, LongAuthenticityInfo>> {
  const entries = await Promise.all(addresses.map(async (address): Promise<[string, LongAuthenticityInfo]> => {
    try {
      const url = new URL("https://api.long.xyz/v1/assets/authenticity");
      url.searchParams.set("chainId", String(LONG_CHAIN_ID));
      url.searchParams.set("assetAddress", address);
      const response = await fetch(url, { headers: { "x-api-key": LONG_API_KEY } });
      if (!response.ok) return [address, { verdict: "unavailable", failures: [] }];
      return [address, normalizeLongAuthenticity(await response.json())];
    } catch {
      return [address, { verdict: "unavailable", failures: [] }];
    }
  }));
  return Object.fromEntries(entries);
}

function isRelayRequest(message: unknown): message is { type: "vamp:long-relay"; addresses: string[] } {
  if (typeof message !== "object" || message === null || Reflect.get(message, "type") !== "vamp:long-relay") return false;
  const addresses = Reflect.get(message, "addresses");
  return Array.isArray(addresses) && addresses.length > 0 && addresses.length <= 36
    && addresses.every((address) => typeof address === "string" && /^0x[0-9a-f]{40}$/i.test(address));
}
