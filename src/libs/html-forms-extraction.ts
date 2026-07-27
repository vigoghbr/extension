function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export interface PageFormField {
  label: string;
  placeholder: string;
  type: string;
  value: string;
}

export function extractPageForms(doc: Document): PageFormField[] {
  const fields: PageFormField[] = [];
  doc.querySelectorAll("input, textarea, select").forEach((el) => {
    const id = el.getAttribute("id") || el.getAttribute("name") || "";
    const label = id
      ? normalizeWhitespace(
          doc.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent ??
            "",
        )
      : "";
    const placeholder = el.getAttribute("placeholder") || "";
    const type = el.getAttribute("type") || el.tagName.toLowerCase();
    const value = normalizeWhitespace(
      String(
        (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)
          .value || "",
      ),
    );

    if (type === "hidden") return;
    if (label || placeholder) {
      fields.push({ label, placeholder, type, value });
    }
  });
  return fields;
}

export function formatPageForms(fields: PageFormField[]): string {
  if (fields.length === 0) return "";
  return fields
    .map((f) => {
      const identifier = f.label || f.placeholder;
      return `[${f.type}] ${identifier}: "${f.value}"`;
    })
    .join("\n");
}
