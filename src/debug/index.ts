import type { DebugLogEntry, DebugLogLevel, DebugLogSource } from "@/types";

const MAX_ENTRIES = 100;

const entries: DebugLogEntry[] = [];
const sourceFilters = new Set<DebugLogSource>([
  "background",
  "sidepanel",
  "content",
]);
const levelFilters = new Set<DebugLogLevel>(["log", "info", "warn", "error"]);
let searchText = "";
let paused = false;

const logContainer = document.getElementById("log-container") as HTMLDivElement;
const countLabel = document.getElementById("count-label") as HTMLSpanElement;
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const pauseButton = document.getElementById(
  "pause-button",
) as HTMLButtonElement;
const clearButton = document.getElementById(
  "clear-button",
) as HTMLButtonElement;
const emptyState = document.getElementById("empty-state") as HTMLDivElement;

function matchesFilter(entry: DebugLogEntry): boolean {
  if (!sourceFilters.has(entry.source)) return false;
  if (!levelFilters.has(entry.level)) return false;
  if (!searchText) return true;
  const haystack = `${entry.prefix} ${entry.data ?? ""}`.toLowerCase();
  return haystack.includes(searchText);
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString("en-US", { hour12: false });
  return `${time}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

function createRow(entry: DebugLogEntry): HTMLDivElement {
  const row = document.createElement("div");
  row.className = `log-row level-${entry.level} source-${entry.source}`;

  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = formatTime(entry.timestamp);

  const source = document.createElement("span");
  source.className = "log-badge log-source";
  source.textContent = entry.source.slice(0, 2).toUpperCase();

  const level = document.createElement("span");
  level.className = "log-badge log-level";
  level.textContent = entry.level.toUpperCase();

  const prefix = document.createElement("span");
  prefix.className = "log-prefix";
  prefix.textContent = entry.prefix;

  row.append(time, source, level, prefix);

  if (entry.data) {
    const data = document.createElement("pre");
    data.className = "log-data collapsed";
    data.textContent = entry.data;
    data.addEventListener("click", () => data.classList.toggle("collapsed"));
    row.append(data);
  }

  return row;
}

function isScrolledToBottom(): boolean {
  return (
    logContainer.scrollHeight -
      logContainer.scrollTop -
      logContainer.clientHeight <
    40
  );
}

function updateCountLabel(): void {
  countLabel.textContent = `${entries.length} entries`;
}

function pruneRenderedRows(): void {
  while (logContainer.children.length > MAX_ENTRIES) {
    logContainer.firstElementChild?.remove();
  }
}

function appendEntry(entry: DebugLogEntry): void {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
  updateCountLabel();

  if (!matchesFilter(entry)) return;

  emptyState.remove();
  const shouldScroll = isScrolledToBottom();
  logContainer.append(createRow(entry));
  pruneRenderedRows();
  if (shouldScroll) logContainer.scrollTop = logContainer.scrollHeight;
}

function rerender(): void {
  logContainer.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    if (matchesFilter(entry)) fragment.append(createRow(entry));
  }
  logContainer.append(fragment);
  logContainer.scrollTop = logContainer.scrollHeight;
}

for (const checkbox of document.querySelectorAll<HTMLInputElement>(
  "[data-source-filter]",
)) {
  checkbox.addEventListener("change", () => {
    const source = checkbox.dataset.sourceFilter as DebugLogSource;
    if (checkbox.checked) sourceFilters.add(source);
    else sourceFilters.delete(source);
    rerender();
  });
}

for (const checkbox of document.querySelectorAll<HTMLInputElement>(
  "[data-level-filter]",
)) {
  checkbox.addEventListener("change", () => {
    const level = checkbox.dataset.levelFilter as DebugLogLevel;
    if (checkbox.checked) levelFilters.add(level);
    else levelFilters.delete(level);
    rerender();
  });
}

searchInput.addEventListener("input", () => {
  searchText = searchInput.value.trim().toLowerCase();
  rerender();
});

pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.textContent = paused ? "Resume" : "Pause";
  pauseButton.classList.toggle("active", paused);
});

clearButton.addEventListener("click", () => {
  entries.length = 0;
  updateCountLabel();
  logContainer.replaceChildren();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.action !== "debug_log_broadcast") return false;
  if (!paused) appendEntry(message.entry as DebugLogEntry);
  return false;
});
