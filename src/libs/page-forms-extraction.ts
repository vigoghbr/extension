function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function extractPageForms(): string {
  const fields: string[] = [];
  document.querySelectorAll("input, textarea, select").forEach((el) => {
    const id = el.getAttribute("id") || el.getAttribute("name") || "";
    const label = id
      ? normalize(
          document.querySelector(`label[for="${CSS.escape(id)}"]`)
            ?.textContent ?? "",
        )
      : "";
    const placeholder = el.getAttribute("placeholder") || "";
    const type = el.getAttribute("type") || el.tagName.toLowerCase();
    const value = normalize(
      String(
        (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)
          .value || "",
      ),
    );
    if (type === "hidden" || type === "password") return;
    if (!label && !placeholder) return;
    const identifier = label || placeholder;
    fields.push(`[${type}] ${identifier}: "${value}"`);
  });
  return fields.join("\n");
}
