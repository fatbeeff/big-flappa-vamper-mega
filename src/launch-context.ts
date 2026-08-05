export type LaunchMetadataValues = {
  originalName: string;
  originalSymbol: string;
  imageUrl: string;
  description: string;
  website: string;
  x: string;
  telegram: string;
};

export type LaunchContext = LaunchMetadataValues & {
  sourceAddress: string;
  translatedName?: string;
  translatedSymbol?: string;
  enrichmentUrl?: string;
};

export type LaunchMetadataEnrichment = Partial<LaunchMetadataValues>;

const metadataKeys: ReadonlyArray<keyof LaunchMetadataValues> = [
  "originalName",
  "originalSymbol",
  "imageUrl",
  "description",
  "website",
  "x",
  "telegram",
];

export function parseLaunchContext(raw: string | undefined): LaunchContext | undefined {
  if (!raw) return undefined;

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return undefined;
    const sourceAddress = readString(value, "sourceAddress");
    const originalName = readString(value, "originalName");
    const originalSymbol = readString(value, "originalSymbol");
    if (!sourceAddress || !originalName || !originalSymbol) return undefined;

    return {
      sourceAddress,
      originalName,
      originalSymbol,
      imageUrl: readString(value, "imageUrl"),
      description: readString(value, "description"),
      website: readString(value, "website"),
      x: readString(value, "x"),
      telegram: readString(value, "telegram"),
      translatedName: readOptionalString(value, "translatedName"),
      translatedSymbol: readOptionalString(value, "translatedSymbol"),
      enrichmentUrl: readOptionalString(value, "enrichmentUrl"),
    };
  } catch {
    return undefined;
  }
}

export function parseLaunchMetadataEnrichment(value: unknown): LaunchMetadataEnrichment {
  if (!isRecord(value)) throw new Error("Launch Metadata enrichment was not an object");

  const enrichment: LaunchMetadataEnrichment = {};
  for (const key of metadataKeys) {
    const candidate = value[key];
    if (typeof candidate === "string") enrichment[key] = candidate;
  }
  return enrichment;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: Record<string, unknown>, key: string): string {
  return typeof value[key] === "string" ? value[key] : "";
}

function readOptionalString(value: Record<string, unknown>, key: string): string | undefined {
  const result = readString(value, key);
  return result || undefined;
}
