export function isExtensionContextValid(): boolean {
  return !!chrome.runtime?.id;
}
