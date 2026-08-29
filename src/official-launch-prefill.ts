import { loadPendingOfficialLaunch, OFFICIAL_LAUNCH_STORAGE_KEY, type OfficialLaunchDestination } from "./official-launch-handoff";
import type { LaunchMetadataValues } from "./launch-context";

const destination: OfficialLaunchDestination | null = location.hostname === "app.long.xyz" ? "long" : null;

if (destination) void install(destination);

async function install(platform: OfficialLaunchDestination): Promise<void> {
  const pending = await loadPendingOfficialLaunch(platform);
  if (!pending) return;
  let scheduled = false;
  const fill = () => {
    scheduled = false;
    const complete = fillLong(pending.metadata);
    if (complete) {
      observer.disconnect();
      void chrome.storage.local.remove(OFFICIAL_LAUNCH_STORAGE_KEY);
    }
  };
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(fill);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  fill();
}

function fillLong(metadata: LaunchMetadataValues): boolean {
  const heading = Array.from(document.querySelectorAll("h1")).find((node) => node.textContent?.trim() === "Name your token");
  if (!heading) return false;
  const fields = Array.from(document.querySelectorAll<HTMLInputElement>('input:not([type="file"]):not([type="hidden"])'))
    .filter((field) => field.offsetParent !== null);
  if (fields.length < 2) return false;
  setValue(fields[0], metadata.originalSymbol.toUpperCase().slice(0, 15));
  setValue(fields[1], metadata.originalName);
  if (fields[2]) setValue(fields[2], metadata.x || metadata.website || metadata.telegram);
  setValue(document.querySelector("textarea"), metadata.description.slice(0, 100));
  void setImage(document.querySelector('input[type="file"]'), metadata.imageUrl);
  return true;
}

function setValue(control: Element | null, value: string): void {
  if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) || !value || control.value) return;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value")?.set;
  setter?.call(control, value);
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

async function setImage(control: Element | null, url: string): Promise<void> {
  if (!(control instanceof HTMLInputElement) || !url || control.files?.length) return;
  try {
    const response = await fetch(url);
    if (!response.ok) return;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return;
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "source-token-image", { type: blob.type }));
    control.files = transfer.files;
    control.dispatchEvent(new Event("change", { bubbles: true }));
  } catch { /* The official form remains ready for manual image selection. */ }
}
