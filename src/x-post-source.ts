const SOURCE_ATTRIBUTE = "data-vamp-post-source";
const sourceByPost = new Map<string, { label: string; href: string | null }>();

const nativeFetch = window.fetch.bind(window);
window.fetch = async (...args: Parameters<typeof window.fetch>): Promise<Response> => {
  const response = await nativeFetch(...args);
  if (/\/(TweetResultByRestId|TweetDetail)(?:\?|$)/.test(response.url)) {
    void response.clone().json().then(readSources).catch(() => undefined);
  }
  return response;
};

function readSources(value: unknown): void {
  collectSources(value);
  renderCurrentSource();
}

function collectSources(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(collectSources);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  const record = value as Record<string, unknown>;
  const legacy = asRecord(record.legacy);
  const id = stringValue(record.rest_id) ?? stringValue(legacy?.id_str);
  const source = stringValue(record.source) ?? stringValue(legacy?.source);
  if (id && source) sourceByPost.set(id, parseSource(source));

  Object.values(record).forEach(collectSources);
}

function parseSource(html: string): { label: string; href: string | null } {
  const document = new DOMParser().parseFromString(html, "text/html");
  const anchor = document.querySelector("a");
  const href = safeHttpUrl(anchor?.getAttribute("href"));
  return { label: (anchor?.textContent ?? document.body.textContent ?? html).trim(), href };
}

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch { return null; }
}

function renderCurrentSource(): void {
  const postId = location.pathname.match(/\/status\/(\d+)/)?.[1];
  const source = postId ? sourceByPost.get(postId) : undefined;
  if (!postId || !source || document.querySelector(`[${SOURCE_ATTRIBUTE}="${postId}"]`)) return;

  const timestamp = Array.from(document.querySelectorAll<HTMLAnchorElement>(`a[href*="/status/${postId}"]`))
    .find((anchor) => anchor.querySelector("time"));
  if (!timestamp) return;

  const label = document.createElement(source.href ? "a" : "span");
  label.setAttribute(SOURCE_ATTRIBUTE, postId);
  label.textContent = ` · ${source.label}`;
  label.title = "Posting client reported by X; this is not physical-device proof.";
  label.style.cssText = `color:${getComputedStyle(timestamp).color};font:inherit;text-decoration:none`;
  if (label instanceof HTMLAnchorElement && source.href) {
    label.href = source.href;
    label.target = "_blank";
    label.rel = "nofollow noreferrer";
  }
  timestamp.insertAdjacentElement("afterend", label);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

new MutationObserver(renderCurrentSource).observe(document, { childList: true, subtree: true });
window.addEventListener("popstate", renderCurrentSource);
