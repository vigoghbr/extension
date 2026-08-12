function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function extractPageMetadata(): string {
  const title = normalize(document.querySelector("title")?.textContent ?? "");
  const description = normalize(
    document
      .querySelector('meta[name="description"]')
      ?.getAttribute("content") ?? "",
  );
  const headings: string[] = [];
  document.querySelectorAll("h1, h2, h3").forEach((el) => {
    const text = normalize(el.textContent ?? "");
    if (text) headings.push(text);
  });

  const parts: string[] = [];
  if (title) parts.push(`Title: ${title}`);
  if (description) parts.push(`Description: ${description}`);
  if (headings.length > 0) parts.push(`Headings: ${headings.join(" | ")}`);
  return parts.join("\n");
}
