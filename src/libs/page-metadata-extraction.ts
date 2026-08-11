function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function extractPageMetadata(maxLinks: number): string {
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
  const links: { text: string; href: string }[] = [];
  const seen = new Set<string>();
  const anchors = document.querySelectorAll("a[href]");
  for (const el of Array.from(anchors)) {
    if (links.length >= maxLinks) break;
    const href = el.getAttribute("href") ?? "";
    const text = normalize(el.textContent ?? "");
    if (!text || !href || href === "#" || seen.has(href)) continue;
    seen.add(href);
    links.push({ text, href });
  }

  const parts: string[] = [];
  if (title) parts.push(`Title: ${title}`);
  if (description) parts.push(`Description: ${description}`);
  if (headings.length > 0) parts.push(`Headings: ${headings.join(" | ")}`);
  if (links.length > 0) {
    parts.push(
      `Links: ${links.map((l) => `${l.text} → ${l.href}`).join("; ")}`,
    );
  }
  return parts.join("\n");
}
