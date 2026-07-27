# Vigogh Browser Extension

The [Vigogh](https://vigogh.com) Chrome extension (Manifest V3) that brings AI-powered writing assistance to any page you're on: autocomplete, contextual answers, and text transforms, available from a side panel or directly inline.

This is the open source client. It ships no AI logic, prompts, or business rules of its own, everything it does is call the Vigogh API and relay the result back into the page. See [Architecture](#architecture) for why that split exists and what it means for what you're reading here.

## Why open source

Browser extensions ask for meaningful access: reading the active tab, running scripts, writing to the clipboard. That's a lot of trust to ask for behind closed source. Publishing this code lets anyone verify exactly what it does with that access, nothing is captured, stored, or sent anywhere beyond what's described below. It also means bug reports and site-compatibility fixes can come from anyone who hits them, not just the core team.

## What it does and doesn't do

- **Does**: capture page content/screenshot on demand, forward it to the Vigogh API, and insert the AI-generated result back into the page.
- **Does not**: run any AI model, store page content persistently, or observe pages you haven't explicitly interacted with.

Captured page data lives in the background worker's memory only, for the duration of a single request, and is discarded immediately after. There is no persistent history of what you've captured.

## Architecture

Three layers, each with a narrow responsibility:

- **Background service worker** — handles the extension icon click, orchestrates on-demand script injection into the active tab, and holds captured page data in memory just long enough to forward it.
- **Side panel** — a thin shell hosting an iframe that loads the Vigogh web app. A bridge module relays messages between the iframe (`postMessage`) and the background worker (`chrome.runtime`).
- **Content script** — bootstraps in-page tools (autocomplete, answers, text transforms) inside a shadow DOM, so extension styles never leak into or out of the host page.

All authentication, API calls, and UI logic live in the Vigogh web app, loaded inside the side panel's iframe. The extension itself is intentionally a bridge, not a client application: it captures data, forwards it, and applies the result. This keeps the codebase you're reading small enough to actually audit.

## Permissions

Every permission in `manifest.json` maps to a specific, narrow need:

| Permission | Why |
|---|---|
| `activeTab` | Grants temporary access to the tab you're on, only after you click the extension icon. Revoked on tab switch. |
| `scripting` | Required to run the on-demand capture and text-insertion scripts, only when you trigger a tool. |
| `storage` | Local storage for the auth token, extension config, and per-site preferences. Nothing leaves the device except what's explicitly sent to the API. |
| `clipboardWrite` | Used for one-click copy of AI-generated suggestions. |
| `sidePanel` | Renders the side panel UI. |

No `<all_urls>` content script runs by default. Broader host access, when needed for tab capture, is requested explicitly at runtime through a permission prompt in the side panel, never silently.

## Getting started

Requirements: Node version pinned in `.nvmrc`, Yarn.

```bash
yarn install
yarn dev
```

`yarn dev` builds in watch mode against a local development backend. Load the `dist/` folder as an unpacked extension via `chrome://extensions` (enable Developer mode first).

Other useful scripts:

```bash
yarn typecheck   # TypeScript, no emit
yarn lint        # Biome lint
yarn format      # Biome format
```

Never run the production build (`yarn build`) during local development, it points the extension at production URLs.

## Contributing

Issues and pull requests are welcome, especially for site-compatibility fixes (editors and pages the tools don't behave well on) and accessibility improvements. Please open an issue for larger changes before sending a PR, so we can align on approach first.

## License

Apache 2.0, see [LICENSE](./LICENSE.md).
