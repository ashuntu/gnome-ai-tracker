# AGENTS.md — gnome-ai-tracker

## Project Overview

This is a GNOME Shell extension that tracks AI usage limits across various providers and displays them in the system panel. It is written in TypeScript (compiled to GJS) and targets GNOME Shell 50.

**UUID:** `gnome-ai-tracker@ashuntu.github.io`
**License:** AGPL-3.0-only

## File Structure

```
gnome-ai-tracker
├── extension.ts              # Main extension entry point (TypeScript source)
├── prefs.ts                  # Preferences UI (GTK4/Adwaita, separate process)
├── ambient.d.ts              # GJS/GNOME Shell type augmentations
├── tsconfig.json             # TypeScript compiler configuration
├── eslint.config.js          # ESLint flat config
├── Makefile                  # Build, pack, install, clean targets
├── package.json              # bun scripts and dependencies
├── metadata.json             # Extension metadata (uuid, name, shell-version)
├── stylesheet.css            # Custom CSS for extension UI elements
├── providers/                # Provider type implementations and shared prefs widgets
├── icons/                    # Bundled provider SVG icons
├── schemas/                  # GSettings schema and compiled binary
├── dist/                     # Compiled JS output (do not edit directly)
```

Source files are TypeScript (`.ts`). The compiled output goes to `dist/` and is what GNOME Shell loads. Do not edit files in `dist/` directly.

### Makefile targets

| Target | Description |
|--------|-------------|
| `make` / `make all` | Compile TypeScript to `dist/` (runs `bun install` if needed) |
| `make pack` | Build and produce `gnome-ai-tracker.zip` for distribution |
| `make install` | Build, pack, and install via `gnome-extensions install --force` |
| `make clean` | Remove `dist/`, `node_modules/`, and the zip file |

`extension.ts` exports a default class that extends `Extension` from the GNOME Shell extensions API. It must implement `enable()` and `disable()`, creating and destroying UI components respectively. No state should persist after `disable()` — all references must be set to `null`.

## Code Quality

### Required checks before finishing any task

Run all three and fix all errors before considering work done:

```sh
bun run typecheck       # tsc --noEmit: must exit 0 with no diagnostics
bun run lint            # eslint .: must exit 0 with no errors
bun run test:coverage   # bun test: must exit 0 with no failures, and equal or exceed existing coverage percentage
```

Warnings from `@typescript-eslint/no-explicit-any` are permitted when dealing with untyped GNOME Shell internals, but prefer typed alternatives where possible.

### bun scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `tsc` | Compile TypeScript to `dist/` |
| `typecheck` | `tsc --noEmit` | Type-check without emitting |
| `lint` | `eslint .` | Lint all `.ts` files |
| `lint:fix` | `eslint . --fix` | Auto-fix lint issues |

## GJS and GNOME Shell Extension Patterns

### Imports

This project uses ES Modules (preferred over legacy `imports.*`):

```ts
// GNOME platform libraries use the gi:// URI scheme
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

// GNOME Shell internals use resource:// URIs
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Local modules use relative paths with explicit .js extensions (required by NodeNext)
import type {IProviderType, ProviderInstance, ProviderMetric} from './providers/index.js';
import {loadInstances, PROVIDER_TYPES} from './providers/index.js';

// Preferences UI uses GTK4/Adwaita APIs (separate process)
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
```

### GObject Subclassing

Panel indicators and other GNOME Shell UI elements must be registered GObject subclasses:

```ts
const MyIndicator = GObject.registerClass(
class MyIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('Indicator Name'));
    }
});
```

Use `GObject.registerClass` with a metadata object when you need custom properties or signals:

```ts
const MyWidget = GObject.registerClass({
    GTypeName: 'MyWidget',
    Properties: {
        'my-prop': GObject.ParamSpec.string('my-prop', '', '', GObject.ParamFlags.READWRITE, ''),
    },
    Signals: { 'my-signal': {} },
}, class MyWidget extends GObject.Object { /* ... */ });
```

### Indicator Pattern (AiTrackerIndicator)

The extension uses a custom indicator with a `setup()` method (rather than passing everything through `_init()`) and a `destroy()` cleanup method:

```ts
const AiTrackerIndicator = GObject.registerClass(
class AiTrackerIndicator extends PanelMenu.Button {
    _init() { super._init(0.5, _('AI Usage Tracker')); }

    setup(settings, extensionPath, openPrefs) {
        this._settings = settings;
        this._session = new Soup.Session();
        // connect signals, build menu, schedule refresh
    }

    destroy() {
        // remove timer, disconnect signals, clear maps, null out refs
        super.destroy();
    }
});
```

### Extension Lifecycle

```ts
export default class MyExtension extends Extension {
    private _indicator: InstanceType<typeof AiTrackerIndicator> | null = null;

    enable() {
        const settings = this.getSettings('org.gnome.shell.extensions.gnome-ai-tracker');
        this._indicator = new AiTrackerIndicator();
        this._indicator.setup(settings, this.path, () => this.openPreferences());
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
```

### Signals and Memory Management

Always disconnect signal handlers in `disable()` or in the indicator's `destroy()`. Store connection IDs and disconnect them explicitly. Failing to disconnect causes memory leaks and errors on re-enable.

```ts
private _settingsChangedId: number | null = null;

enable() {
    this._settingsChangedId = this._settings.connect('changed', this._onChanged.bind(this));
}

destroy() {
    if (this._settingsChangedId !== null) {
        this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = null;
    }
}
```

### Async Operations

Use `Gio` async APIs with `Promise` wrappers or the `async/await` pattern. Do not block the main thread. Provider fetching uses `Soup.Session` and is async:

```ts
import Soup from 'gi://Soup?version=3.0';

const session = new Soup.Session();
const result = await providerType.fetchStatus(session, instance);
```

### Styling

`stylesheet.css` is loaded automatically by GNOME Shell. Use CSS class names applied via `style_class` on St widgets. Avoid inline styles.

### Preferences

`prefs.ts` runs in a separate GTK4 process. It exports a default class extending `ExtensionPreferences` and implements `fillPreferencesWindow()`. The preferences use `Adw.PreferencesWindow` with navigation pages (`Adw.NavigationPage`), subpages for add/edit flows, and reactive groups that rebuild when `provider-instances` GSettings key changes.

## Provider Architecture

Providers are implemented as **singleton objects** conforming to the `IProviderType` interface (defined in `providers/base.ts`). Each provider:

- Has a unique `id`, `displayName`, `description`, `iconName` (optional `iconPath`)
- Returns `metricLabels` (ordered list of metric names)
- Implements `fetchStatus(session, instance) => Promise<ProviderStatus>`

Provider instances are serialised as `ProviderInstance` objects stored in the `provider-instances` GSettings string array key. Use `loadInstances(settings)` / `saveInstances(settings, instances)` (from `providers/base.ts`) to read/write.

Registered provider types are listed in `PROVIDER_TYPES` (from `providers/index.ts`).

Shared prefs widgets (`providers/prefs-widgets.ts`) provide `buildApiKeyGroup()`, `buildPollingGroup()`, and `buildDebugGroup()` for provider settings pages.

## Number Formatting

**Always format percentages and dollar amounts to exactly 2 decimal places.** Use `.toFixed(2)` — never `.toFixed(4)` or bare number interpolation.

```ts
// Correct
`$${value.toFixed(2)}`       // "$1.23"
`${percent.toFixed(2)}%`     // "42.00%"

// Wrong — do not use
`$${value.toFixed(4)}`       // too many decimal places
`${percent}%`                // may produce "42.123456789%"
```

This applies everywhere a number is shown in the panel label, menu items, or any other UI surface. This rule has been intentionally set and must not be reverted.

## Contributing

When adding or modifying code:

1. Write TypeScript (`.ts`), not JavaScript (`.js`). Only `eslint.config.js` stays as JS (ESLint requires it).
2. Use ES Modules, not legacy `imports.*`.
3. Register all GObject subclasses with `GObject.registerClass`.
4. Null out all references in `disable()` and disconnect all signals.
5. Use GNOME platform APIs (`Gio`, `GLib`, `Soup`) rather than Node.js or browser APIs.
6. Follow the [GJS Style Guide](https://gjs.guide/guides/gjs/style-guide.html): `camelCase` for variables/methods, `PascalCase` for classes, `UPPER_SNAKE_CASE` for constants.
7. Prefer `const` over `let`; avoid `var`.
8. Do not use semicolons to terminate property definitions inside GObject metadata objects.
9. The tsconfig uses `module: "ESNext"` with `moduleResolution: "bundler"` so extensionless imports are allowed. However, local imports in source files (extension.ts, prefs.ts, providers/*.ts) should still use `.js` extensions for GJS runtime compatibility (GJS ESM requires file extensions). Test file imports should omit `.js` extensions since bun resolves them natively.
10. When adding a new provider type, add it to `providers/` (as a new file implementing `IProviderType`) and register it in `providers/index.ts`'s `PROVIDER_TYPES` array. Add a bundled icon to `icons/` if needed.

## Reference Documentation

- **GJS Guides:** https://gjs.guide/guides/
  - Intro: https://gjs.guide/guides/gjs/intro.html
  - Async Programming: https://gjs.guide/guides/gjs/asynchronous-programming.html
  - Style Guide: https://gjs.guide/guides/gjs/style-guide.html
  - Memory Management: https://gjs.guide/guides/gjs/memory-management.html
  - GObject Basics: https://gjs.guide/guides/gobject/basics.html
  - GObject Subclassing: https://gjs.guide/guides/gobject/subclassing.html
  - Gio DBus: https://gjs.guide/guides/gio/dbus.html
  - Gio File Operations: https://gjs.guide/guides/gio/file-operations.html
  - Gio Subprocesses: https://gjs.guide/guides/gio/subprocesses.html
- **GJS API Docs:** https://gjs-docs.gnome.org/
  - GJS built-ins: https://gjs-docs.gnome.org/gjs/
  - Gio: https://gjs-docs.gnome.org/gio20/
  - GLib: https://gjs-docs.gnome.org/glib20/
  - Soup 3: https://gjs-docs.gnome.org/soup30/
  - St (Shell Toolkit): search at https://gjs-docs.gnome.org/
- **GNOME Shell Extension Guides:** https://gjs.guide/extensions/
  - Getting Started: https://gjs.guide/extensions/development/creating.html
  - TypeScript and LSP: https://gjs.guide/extensions/development/typescript.html
  - Anatomy of an Extension: https://gjs.guide/extensions/overview/anatomy.html
  - Architecture: https://gjs.guide/extensions/overview/architecture.html
  - Imports and Modules: https://gjs.guide/extensions/overview/imports-and-modules.html
  - Updates and Breakage: https://gjs.guide/extensions/overview/updates-and-breakage.html
  - Extension (ESModule API): https://gjs.guide/extensions/topics/extension.html
  - Popup Menu: https://gjs.guide/extensions/topics/popup-menu.html
  - Quick Settings: https://gjs.guide/extensions/topics/quick-settings.html
  - Notifications: https://gjs.guide/extensions/topics/notifications.html
  - Dialogs: https://gjs.guide/extensions/topics/dialogs.html
  - Session Modes: https://gjs.guide/extensions/topics/session-modes.html
  - Preferences: https://gjs.guide/extensions/development/preferences.html
  - Debugging: https://gjs.guide/extensions/development/debugging.html
  - Translations: https://gjs.guide/extensions/development/translations.html
  - Porting to GNOME Shell 50: https://gjs.guide/extensions/upgrading/gnome-shell-50.html
  - Review Guidelines: https://gjs.guide/extensions/review-guidelines/review-guidelines.html

### Adwaita Deprecations

`Adw.PreferencesWindow` is deprecated since libadwaita 1.6 in favour of `Adw.PreferencesDialog`. However, GNOME Shell 50's own prefs infrastructure (`ExtensionPrefsDialog`) still subclasses `Adw.PreferencesWindow` and passes that instance to `fillPreferencesWindow`. The `ExtensionPreferences.fillPreferencesWindow` signature therefore retains `Adw.PreferencesWindow` as its parameter type — do not change it.

Do **not** instantiate `new Adw.PreferencesWindow()` directly in extension code. ESLint is configured to flag this as an error (`no-restricted-syntax` rule in `eslint.config.js`).

### Key Extension Architecture Notes

- `extension.js` runs **inside the `gnome-shell` process**. Crashes or unhandled errors affect the entire desktop. Use `prefs.js` for preferences UI, which runs in a separate GTK4 process.
- The `Extension` class constructor is called once at load time — do not connect signals, modify Shell state, or create UI there. Reserve all side effects for `enable()`.
- `prefs.js` uses GTK4 + Adwaita (`gi://Gtk?version=4.0`, `gi://Adw`). It does **not** have access to GNOME Shell internals or St widgets.
- GNOME Shell uses the Clutter + St widget toolkit (not GTK). Use `St` for extension UI widgets.
- Extensions run in the `user` session mode by default. To run on the lock screen, add `"unlock-dialog"` to `session-modes` in `metadata.json` and handle `enable()`/`disable()` being called on lock/unlock.
- As of GNOME 45, extensions must use ES Modules. The legacy `imports.*` pattern and CommonJS-style `const X = Me.imports.x` are no longer supported.
- GNOME Shell 50 adds `easeAsync()` for awaitable Clutter transitions, and one-shot GLib timer helpers: `GLib.idle_add_once()`, `GLib.timeout_add_once()`, `GLib.timeout_add_seconds_once()`.
- Provider instances are stored as JSON strings in the `provider-instances` GSettings `strv` key. The `providers/base.ts` module provides `loadInstances()` / `saveInstances()` helpers.
- Providers use `Soup.Session` (Soup 3.0) for HTTP requests. A single session is shared across the indicator's lifetime.
