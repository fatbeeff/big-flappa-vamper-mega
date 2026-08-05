import type { SourceTokenIdentity } from "./launch-context";

export interface SourceTokenContractResolver {
  resolve(address: string): Promise<SourceTokenIdentity>;
}

export function createSourceTokenContractResolver(): SourceTokenContractResolver {
  return {
    async resolve(address) {
      const response: unknown = await chrome.runtime.sendMessage({
        type: "vamp:resolve-source-token",
        address,
      });
      if (!isSuccessfulResponse(response)) throw new Error("Source Token identity resolution failed");
      return response.identity;
    },
  };
}

function isSuccessfulResponse(
  value: unknown,
): value is { ok: true; identity: SourceTokenIdentity } {
  if (typeof value !== "object" || value === null || Reflect.get(value, "ok") !== true) return false;
  const identity = Reflect.get(value, "identity");
  return typeof identity === "object"
    && identity !== null
    && typeof Reflect.get(identity, "name") === "string"
    && typeof Reflect.get(identity, "symbol") === "string";
}
