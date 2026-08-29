import type { FlapLaunchRequest } from "./flap-contract";
import { tokenImageFile, validatePublicHttpsImageUrl } from "./flap-launch";
import { PONS_IMAGE_UPLOAD_ENDPOINT, PONS_MAX_IMAGE_BYTES } from "./pons-launch";

type ScriptDetails = {
  target: { tabId: number };
  world: "MAIN";
  args?: unknown[];
  func: (...args: never[]) => unknown;
};

export type PonsUploadBrowser = {
  tabs: {
    create(properties: { url: string; active: false }): Promise<{ id?: number; status?: string }>;
    get(tabId: number): Promise<{ status?: string }>;
    remove(tabId: number): Promise<unknown>;
  };
  scripting: { executeScript(details: ScriptDetails): Promise<Array<{ result?: unknown }>> };
};

export async function uploadPonsImageFromPonsOrigin(
  request: Pick<FlapLaunchRequest, "imageSource">,
  browser: PonsUploadBrowser = chrome as unknown as PonsUploadBrowser,
  requestFetch: typeof fetch = fetch,
): Promise<string> {
  const file = await ponsImageFile(request, browser, requestFetch);
  if (file.size > PONS_MAX_IMAGE_BYTES) throw new Error("PONS token images must be smaller than 5 MB.");
  const tab = await browser.tabs.create({ url: "https://www.ponsfamily.com/", active: false });
  if (tab.id === undefined) throw new Error("A temporary PONS upload tab could not be created.");

  try {
    await waitForPage(browser, tab.id, tab.status);
    const [{ result } = {}] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      args: [{ bytes: Array.from(new Uint8Array(await file.arrayBuffer())), name: file.name, type: file.type, endpoint: PONS_IMAGE_UPLOAD_ENDPOINT }],
      func: async ({ bytes, name, type, endpoint }) => {
        const form = new FormData();
        form.append("image", new File([new Uint8Array(bytes)], name, { type }));
        const response = await fetch(endpoint, { method: "POST", body: form });
        const payload = await response.json().catch(() => null);
        return { ok: response.ok, status: response.status, payload };
      },
    });
    return ponsImageUri(result);
  } finally {
    await browser.tabs.remove(tab.id).catch(() => undefined);
  }
}

async function ponsImageFile(
  request: Pick<FlapLaunchRequest, "imageSource">,
  browser: PonsUploadBrowser,
  requestFetch: typeof fetch,
): Promise<File> {
  try { return await tokenImageFile(request, requestFetch); }
  catch (error) {
    if (request.imageSource.kind !== "remote-url" || !/could not be fetched|failed to fetch|fetch failed/i.test(error instanceof Error ? error.message : String(error))) throw error;
  }

  const url = validatePublicHttpsImageUrl(request.imageSource.url).href;
  const tab = await browser.tabs.create({ url, active: false });
  if (tab.id === undefined) throw new Error("A temporary image-copy tab could not be created.");
  try {
    await waitForPage(browser, tab.id, tab.status);
    const [{ result } = {}] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: async () => {
        const response = await fetch(location.href, { credentials: "omit", cache: "no-store" });
        if (!response.ok) return { error: `The source image host returned HTTP ${response.status}.` };
        const mediaType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
        if (!mediaType.startsWith("image/")) return { error: "The source image host did not return an image." };
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > 5 * 1024 * 1024) return { error: "PONS token images must be smaller than 5 MB." };
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 32_768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
        return { dataUrl: `data:${mediaType};base64,${btoa(binary)}`, mediaType };
      },
    });
    if (typeof result !== "object" || result === null || typeof Reflect.get(result, "dataUrl") !== "string" || typeof Reflect.get(result, "mediaType") !== "string") {
      const detail = typeof result === "object" && result !== null ? Reflect.get(result, "error") : undefined;
      throw new Error(typeof detail === "string" ? detail : "The source image could not be copied from its host.");
    }
    return tokenImageFile({ imageSource: { kind: "uploaded-file", dataUrl: Reflect.get(result, "dataUrl"), mediaType: Reflect.get(result, "mediaType"), name: "token-image" } }, requestFetch);
  } finally {
    await browser.tabs.remove(tab.id).catch(() => undefined);
  }
}

async function waitForPage(browser: PonsUploadBrowser, tabId: number, initialStatus?: string): Promise<void> {
  if (initialStatus === "complete") return;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await browser.tabs.get(tabId)).status === "complete") return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The temporary PONS upload page did not become ready.");
}

function ponsImageUri(result: unknown): string {
  const ok = typeof result === "object" && result !== null && Reflect.get(result, "ok") === true;
  const status = typeof result === "object" && result !== null ? Reflect.get(result, "status") : undefined;
  const payload = typeof result === "object" && result !== null ? Reflect.get(result, "payload") : undefined;
  const uri = typeof payload === "object" && payload !== null ? Reflect.get(payload, "uri") : undefined;
  const error = typeof payload === "object" && payload !== null ? Reflect.get(payload, "error") : undefined;
  if (!ok) throw new Error(typeof error === "string" ? error : `PONS image upload failed with HTTP ${String(status ?? "unknown")}.`);
  if (typeof uri !== "string" || !/^ipfs:\/\/[a-zA-Z0-9]+/.test(uri)) throw new Error("PONS image upload returned an invalid IPFS URI.");
  return uri;
}
