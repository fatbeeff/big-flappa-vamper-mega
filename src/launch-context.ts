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
};

export type LaunchMetadataEnrichment = Partial<LaunchMetadataValues>;

export type LaunchImageSource =
  | { kind: "none" }
  | { kind: "remote-url"; url: string }
  | { kind: "uploaded-file"; dataUrl: string; mediaType: string; name: string };

export type SourceTokenIdentity = {
  name: string;
  symbol: string;
};

export function nonEmptyMetadata(values: LaunchMetadataEnrichment): LaunchMetadataEnrichment {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [keyof LaunchMetadataValues, string] =>
      typeof entry[1] === "string" && entry[1].trim().length > 0,
    ),
  );
}
