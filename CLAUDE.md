# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Follow the editing rule in the root `CLAUDE.md` when modifying this file: patterns, strategies, and conventions only, no fragile identifiers.

**Always write code in English:** all identifiers, strings, logs, and any code-level text must be in English, regardless of the conversation language.

## Project Overview

A Chrome extension (Manifest V3) that provides AI-powered text suggestions. When the user clicks the extension icon, a side panel opens containing an iframe that loads the Vigogh web app. The iframe requests page data (content, inputs, screenshot) via `postMessage` and can insert AI-generated text back into the active tab.

## Architecture

The extension has three layers:

- **Background service worker** — handles the icon click, orchestrates on-demand script injection into the active tab, and stores captured page data in memory.
- **Side panel** — a thin shell that hosts an iframe loading the Vigogh web app. A bridge module relays messages between the iframe (`postMessage`) and the background (`chrome.runtime`). A lifecycle module notifies the background on unload and visibility changes.
- **Content script** — a registered script (not on-demand injection) that bootstraps in-page tools: autocomplete, answers, and transforms.

### Why iframe, not extension UI

All heavy lifting (auth, API calls, UI components) lives in the web app. The extension is just a bridge: it captures page data, forwards it to the iframe, and inserts AI-generated text back. This avoids duplicating the entire app codebase inside the extension.

### Why side panel, not popup

A side panel persists across tab navigation. A popup closes on any click outside it, which would destroy the user's session mid-interaction.

### Why on-demand injection for capture/insert, not content scripts

Avoiding persistent content scripts for privileged actions (screenshot, text insertion) means a smaller memory footprint, better privacy (no observation of every page), and cleaner uninstall. Code only runs in tabs when the user explicitly requests a capture or text insertion.

### Why isolated Sentry

Use a manually constructed Sentry browser client with its own scope instead of the global `init`, per Sentry's browser-extension best practices. Both entry points (background, sidepanel) bundle independently with isolated clients.

## Communication Architecture

The two-layer messaging system is the core of the extension:

- **`chrome.runtime` messages** — between content script/sidepanel and background. Each message uses an `action` discriminant.
- **`postMessage`** — between sidepanel and iframe. Each message uses a `type` discriminant.

All message shapes live in a single shared types module as discriminated unions. The iframe (web app) always initiates actions. The sidepanel bridge translates between the two message systems. The background executes privileged Chrome API calls.

## Content Script System

### Store architecture

Three Zustand vanilla stores with clearly separated responsibilities: shared editor and config infrastructure, the autocomplete tool, and the answers/transforms tools. Cross-store reads flow in one direction (tool stores read from the shared infra store) so there are no circular imports.

### Shadow DOM mounting

The content script mounts its React UI into a shadow root for full CSS isolation. A host element is appended to the document body with an open shadow root. Tailwind styles and fonts are injected as a `<style>` tag inside the shadow DOM so they don't leak into or from the host page.

### Why shadow DOM for the content script UI

Without shadow DOM, the extension's Tailwind CSS would conflict with the host page's styles and vice versa. Shadow DOM gives full encapsulation with zero risk of specificity collisions or leaked styles.

### Strategy pattern for editor interaction

Editor interaction is abstracted behind a site-strategy interface covering editor selection, text extraction, conversation context extraction from surrounding DOM, caret coordinates, text insertion, selected-text replacement, full-text replacement, and mutation observer setup. This lets the extension support multiple editor types without scattered conditionals.

### Config lifecycle

The background fetches the extension config on startup and on each authentication, then re-schedules itself using a refresh interval from the fetched config. The config is cached in `chrome.storage.local` so content scripts can read it synchronously on load.

### Answers tool auth flow

If no auth token is present when the user triggers the answers tool, a pending flag is set in storage and the side panel opens for login. After login, the background checks for the pending flag, clears it, and messages the active tab's content script to resume the request.

## Permissions Model

- **`activeTab`** — covers the initial capture after the user clicks the extension icon. Revoked on tab switch.
- **Optional host permissions for all URLs** — requested at runtime via a permission overlay in the sidepanel, because visible-tab capture requires this scope. The user approves once and the permission persists.
- **`scripting`** — required for on-demand script execution (capture and text insertion).
- **`storage`** — for `chrome.storage.local` (auth token, config, per-site enabled state).

## Build System

esbuild with three entry points: background, sidepanel, and content script. Tailwind CSS is compiled separately before esbuild runs and injected into the shadow DOM as a string, because shadow roots don't inherit document-level styles.

`NODE_ENV` controls URL selection (dev vs production). Watch mode controls minification and source maps. These are independent axes: production URLs with source maps is a valid combination for local testing.

**Never run the production build script during development or while making modifications.** The production build runs with `NODE_ENV=production` and points the extension at production URLs, which clobbers the user's local dev setup. To verify a build compiles, always use the dev build script. Only run the production build when the user explicitly asks for one.

## Constraints & Gotchas

- **Always check that the extension context is valid** before calling `chrome.runtime` APIs. This handles extension updates and reloads gracefully without silent failures.
- **Text insertion dispatches both `input` and `change` events** after setting values, for React/Vue/Angular framework compatibility.
- **Captured page data lives in background memory only** — no persistent storage. Data is lost on service worker restart.
- **Double-init guard** — the content script may run both via registration and via `executeScript` when enabling a site while tabs are already open. A global flag prevents double initialization.
- **Request generation counter** — stale API responses are silently dropped when the generation counter has advanced.

## Code Conventions

**Path aliases:** `@/` maps to `src/`.

**Code comments:** never write comments in code. If you find any, remove them.

**User-facing labels:** never hardcode user-facing strings or gate copy on the current region. All extension copy is served by the frontend through the locales pipeline. Adding a new label means extending that pipeline, not writing the string in a component.
