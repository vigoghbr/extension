export interface ExtractedPageData {
  pageURL: string;
  pageContent: string;
  pageMetadata: string;
  pageForms: string;
}

export function extractPageDataInPage(
  mainContentLimit: number,
  maxLinks: number,
): ExtractedPageData {
  const MAIN_CONTENT_LIMIT = mainContentLimit;
  const MAX_LINKS = maxLinks;
  const NOISE_SELECTORS = [
    "script",
    "style",
    "noscript",
    "iframe",
    "svg",
    "canvas",
    "header",
    "footer",
    "nav",
  ];
  const MAIN_CONTENT_SELECTORS = ["main", "article", '[role="main"]'];
  const BLOCK_SELECTOR = [
    "address",
    "article",
    "aside",
    "blockquote",
    "br",
    "dd",
    "details",
    "dialog",
    "div",
    "dl",
    "dt",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hgroup",
    "hr",
    "li",
    "main",
    "nav",
    "ol",
    "p",
    "pre",
    "section",
    "summary",
    "table",
    "td",
    "th",
    "tr",
    "ul",
  ].join(",");

  function normalize(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }

  function extractText(root: Element): string {
    const clone = root.cloneNode(true) as Element;
    for (const sel of NOISE_SELECTORS) {
      clone.querySelectorAll(sel).forEach((el) => el.remove());
    }
    clone.querySelectorAll(BLOCK_SELECTOR).forEach((el) => {
      el.parentNode?.insertBefore(document.createTextNode("\n"), el);
    });
    return normalize(clone.textContent ?? "");
  }

  function extractContent(): string {
    for (const sel of MAIN_CONTENT_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) {
        const text = extractText(el);
        if (text) return text.slice(0, MAIN_CONTENT_LIMIT);
      }
    }
    const body = document.body;
    if (!body) return "";
    return extractText(body).slice(0, MAIN_CONTENT_LIMIT);
  }

  function extractMetadata(): string {
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
      if (links.length >= MAX_LINKS) break;
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

  function extractForms(): string {
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

  return {
    pageURL: window.location.href,
    pageContent: extractContent(),
    pageMetadata: extractMetadata(),
    pageForms: extractForms(),
  };
}
