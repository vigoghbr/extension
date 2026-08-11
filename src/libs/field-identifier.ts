import { toastr } from "@/libs/toastr";
import { DEFAULT_GENERAL_SELECTOR } from "@/utils/general-strategy";

export interface IdentifyFieldHandle {
  promise: Promise<HTMLElement>;
  cancel: () => void;
}

function isInsideExtensionHost(target: Element): boolean {
  return (
    target.id === "vigogh-extension-host" ||
    !!target.closest("#vigogh-extension-host")
  );
}

export function identifyField(toastCode: string): IdentifyFieldHandle {
  const toastId = `vigogh-identify-field-${toastCode}`;
  let settled = false;
  let clickHandler: ((e: MouseEvent) => void) | null = null;

  const cleanup = (): void => {
    if (clickHandler) {
      document.removeEventListener("click", clickHandler, true);
      clickHandler = null;
    }
    toastr.dismiss(toastId);
  };

  const promise = new Promise<HTMLElement>((resolve) => {
    toastr.persistent(toastCode, toastId);

    clickHandler = (e: MouseEvent) => {
      if (settled) return;
      const target = e.target as Element | null;
      if (!target || isInsideExtensionHost(target)) return;
      const editor = target.matches(DEFAULT_GENERAL_SELECTOR)
        ? target
        : target.closest(DEFAULT_GENERAL_SELECTOR);
      if (!editor) return;
      settled = true;
      cleanup();
      resolve(editor as HTMLElement);
    };

    document.addEventListener("click", clickHandler, true);
  });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      cleanup();
    },
  };
}
