import type { ResolvedSourceToken } from "./gmgn-source-token";
import type { LaunchMetadataValues } from "./launch-context";

export const OFFICIAL_LAUNCH_STORAGE_KEY = "pendingOfficialLaunchV1";
export type OfficialLaunchDestination = "long";

export type PendingOfficialLaunch = {
  version: 1;
  destination: OfficialLaunchDestination;
  metadata: LaunchMetadataValues;
  createdAt: number;
};

export async function handoffOfficialLaunch(destination: OfficialLaunchDestination, source: ResolvedSourceToken): Promise<void> {
  const [identity, enrichment] = await Promise.all([
    source.identity?.catch(() => undefined),
    source.enrichment?.catch(() => undefined),
  ]);
  const metadata: LaunchMetadataValues = {
    ...source.context,
    ...Object.fromEntries(Object.entries(enrichment ?? {}).filter(([, value]) => typeof value === "string" && value.trim())),
    originalName: identity?.name || source.context.originalName || source.context.translatedName || "",
    originalSymbol: identity?.symbol || source.context.originalSymbol || source.context.translatedSymbol || "",
  };
  const pending: PendingOfficialLaunch = { version: 1, destination, metadata, createdAt: Date.now() };
  await chrome.storage.local.set({ [OFFICIAL_LAUNCH_STORAGE_KEY]: pending });
  await chrome.runtime.sendMessage({ type: "vamp:open-official-launch", destination });
}

export async function loadPendingOfficialLaunch(destination: OfficialLaunchDestination): Promise<PendingOfficialLaunch | null> {
  const value = (await chrome.storage.local.get(OFFICIAL_LAUNCH_STORAGE_KEY))[OFFICIAL_LAUNCH_STORAGE_KEY];
  if (typeof value !== "object" || value === null || Reflect.get(value, "version") !== 1
    || Reflect.get(value, "destination") !== destination || Date.now() - Number(Reflect.get(value, "createdAt")) > 10 * 60 * 1000) return null;
  const metadata = Reflect.get(value, "metadata");
  return typeof metadata === "object" && metadata !== null ? value as PendingOfficialLaunch : null;
}
