export const LONG_CHAIN_ID = 4663;
export const LONG_API_KEY = "lxyz_49534dc2febae30294149790a8152f44bf915ebbe0332213";

export type LongAuthenticityFailure = {
  id: string;
  message: string;
};

export type LongAuthenticityInfo = {
  verdict: "authentic" | "fake" | "unavailable";
  failures: LongAuthenticityFailure[];
};

export function normalizeLongAuthenticity(value: unknown): LongAuthenticityInfo {
  const result = objectField(value, "result");
  const verdict = field(result, "verdict");
  if (verdict !== "authentic" && verdict !== "fake") {
    return { verdict: "unavailable", failures: [] };
  }
  const rawFailures = field(result, "failures");
  const failures = Array.isArray(rawFailures)
    ? rawFailures.flatMap((failure): LongAuthenticityFailure[] => {
      const id = field(failure, "id");
      const message = field(failure, "message");
      return typeof id === "string"
        ? [{ id, message: typeof message === "string" && message.trim() ? message.trim() : id }]
        : [];
    })
    : [];
  return { verdict, failures };
}

function objectField(value: unknown, name: string): object | null {
  const candidate = field(value, name);
  return typeof candidate === "object" && candidate !== null ? candidate : null;
}

function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;
}
