import type { Locator } from "@playwright/test";

export async function setRangeValue(locator: Locator, value: string): Promise<void> {
  await locator.evaluate((element, next) => {
    const input = element as HTMLInputElement;
    input.value = next;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
