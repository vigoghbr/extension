import { isProbablyReaderable, Readability } from "@mozilla/readability";
import TurndownService from "turndown";

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

const HIDDEN_MARK_ATTRIBUTE = "data-vigogh-hidden";
const IMAGE_ELEMENT_SELECTOR = "img, picture, source, svg";
const MAIN_CONTENT_SELECTOR = "main, [role='main']";
const BOILERPLATE_SELECTOR =
  "nav, header, footer, [role='navigation'], [role='banner'], [role='contentinfo']";
const NON_CONTENT_ELEMENT_SELECTOR = `script, style, noscript, template, iframe, ${BOILERPLATE_SELECTOR}, [${HIDDEN_MARK_ATTRIBUTE}]`;
const DATA_IMAGE_ATTRIBUTES = ["href", "src", "srcset", "poster", "data-src"];
const MIN_ARTICLE_CONTENT_RATIO = 0.5;

function isElementHidden(el: Element): boolean {
  if (typeof el.checkVisibility === "function") {
    return !el.checkVisibility({
      checkOpacity: true,
      checkVisibilityCSS: true,
    });
  }
  const style = getComputedStyle(el);
  return style.display === "none" || style.visibility === "hidden";
}

function markHiddenElements(root: Element): Element[] {
  const hidden = [...root.querySelectorAll("*")].filter(isElementHidden);
  for (const el of hidden) el.setAttribute(HIDDEN_MARK_ATTRIBUTE, "");
  return hidden;
}

function unmarkHiddenElements(elements: Element[]): void {
  for (const el of elements) el.removeAttribute(HIDDEN_MARK_ATTRIBUTE);
}

function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  for (const el of doc.querySelectorAll(NON_CONTENT_ELEMENT_SELECTOR))
    el.remove();
  for (const el of doc.querySelectorAll(IMAGE_ELEMENT_SELECTOR)) el.remove();
  for (const el of doc.querySelectorAll("a")) {
    if (!el.textContent?.trim()) el.remove();
  }

  for (const el of doc.querySelectorAll("*")) {
    for (const attr of DATA_IMAGE_ATTRIBUTES) {
      const value = el.getAttribute(attr);
      if (value?.startsWith("data:image")) el.removeAttribute(attr);
    }
  }

  return doc.body?.innerHTML ?? html;
}

function normalize(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function truncateToByteSize(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return text;
  return new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, maxBytes))
    .replace(/�+$/, "");
}

function extractArticleHtml(): string | null {
  const clone = document.cloneNode(true) as Document;
  if (!isProbablyReaderable(clone)) return null;

  const article = new Readability(clone).parse();
  if (!article?.content) return null;

  const articleLength = article.textContent?.length ?? 0;
  const bodyLength = document.body?.textContent?.length ?? 0;
  if (bodyLength > 0 && articleLength < bodyLength * MIN_ARTICLE_CONTENT_RATIO)
    return null;

  return article.content;
}

function extractFallbackHtml(): string {
  const main = document.querySelector<HTMLElement>(MAIN_CONTENT_SELECTOR);
  return (main ?? document.body)?.innerHTML ?? "";
}

export function extractPageContent(maxBytes: number): string {
  const hiddenElements = markHiddenElements(
    document.body ?? document.documentElement,
  );

  try {
    const html = sanitizeHtml(extractArticleHtml() ?? extractFallbackHtml());
    const markdown = turndownService.turndown(html);

    return truncateToByteSize(normalize(markdown), maxBytes);
  } finally {
    unmarkHiddenElements(hiddenElements);
  }
}
