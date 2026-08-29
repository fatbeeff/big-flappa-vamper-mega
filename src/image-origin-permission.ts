import { validatePublicHttpsImageUrl } from "./flap-launch";

type ImageOriginPermissions = Pick<typeof chrome.permissions, "request">;

export async function ensureImageOriginPermission(
  value: string,
  permissions: ImageOriginPermissions = chrome.permissions,
): Promise<boolean> {
  const permission = { origins: [`${validatePublicHttpsImageUrl(value).origin}/*`] };
  return permissions.request(permission);
}
