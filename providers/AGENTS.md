# providers/

This directory contains the provider system: shared interfaces, instance persistence helpers, all provider type implementations, and shared preferences UI widgets.

## File Overview

| File | Purpose |
|------|---------|
| `base.ts` | Core interfaces and `loadInstances`/`saveInstances` helpers |
| `index.ts` | Re-exports everything from `base.ts`; defines the `PROVIDER_TYPES` registry array |
| `prefs-widgets.ts` | Shared GTK4/Adwaita preference group builders used by provider settings pages |
| `github-copilot.ts` | GitHub Copilot provider implementation |
| `openrouter.ts` | OpenRouter provider implementation |

## Concepts

### Provider Type vs. Provider Instance

A **provider type** (`IProviderType`) is a stateless singleton that describes a service and knows how to fetch data from it.

A **provider instance** (`ProviderInstance`) is a user-configured record: an API key, display name, and enabled flag for one account of a given provider type. Instances are serialised as JSON strings in the `provider-instances` GSettings `strv` key. Use `loadInstances(settings)` and `saveInstances(settings, instances)` to read and write them.

### Data Flow

1. The extension loads instances from GSettings via `loadInstances`.
2. For each enabled instance it finds the matching `IProviderType` in `PROVIDER_TYPES` by `typeId`.
3. It calls `providerType.fetchStatus(session, instance)` on a timer.
4. `ProviderStatus.panelText` is shown in the panel label; `ProviderStatus.metrics` populates the popup menu; `ProviderStatus.rawResponse` is stored back on the instance for the debug viewer.

## Adding a New Provider

1. **Create `providers/<id>.ts`** — export a single `IProviderType` singleton. Implement `fetchStatus` to call the provider's API using the `Soup.Session` passed in, and return a `ProviderStatus` containing `panelText`, `metrics`, and `rawResponse`. The `metrics` array must be in the same order as `metricLabels`. See `IProviderType` and `ProviderStatus` below.

2. **Add a bundled icon** (optional) — place a monochrome SVG at `icons/<id>-symbolic.svg` and set `iconPath` accordingly.

3. **Register in `index.ts`** — export the new type and add it to the `PROVIDER_TYPES` array.

4. **Add a GSettings key** for the refresh interval in `schemas/org.gnome.shell.extensions.gnome-ai-tracker.gschema.xml`, following the existing pattern.

5. **Wire up preferences** in `prefs.ts` — add a settings page for the new provider. Prefer the existing helpers in `prefs-widgets.ts` before introducing new widgets.

6. **Add tests** in `tests/providers/` covering `fetchStatus` for the new provider.

7. **Run quality checks** — `bun run typecheck`, `bun run lint`, and `bun run test:coverage` must all pass with no regressions.

## Key Interfaces

`IProviderType`, `ProviderInstance`, `ProviderMetric`, and `ProviderStatus` are defined and documented in `base.ts`. Read the JSDoc there for field-level details.

## Number Formatting

Always format percentages and dollar amounts to exactly 2 decimal places using `.toFixed(2)`. Never use `.toFixed(4)` or bare number interpolation in UI strings.
