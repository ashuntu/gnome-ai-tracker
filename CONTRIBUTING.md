# Contributing to gnome-ai-tracker

## Prerequisites

### System dependencies

You need a Wayland-capable GNOME Shell environment (GNOME Shell 50) and the following packages:

On Ubuntu/Debian:
```sh
sudo apt install mutter-dev-bin
```

### Bun

This project uses [Bun](https://bun.sh) as the package manager and build runner. Install it with:

```sh
curl -fsSL https://bun.sh/install | bash
```

Bun is used instead of npm/yarn for its speed and native TypeScript support.

## Setup

```sh
git clone <repo>
cd gnome-ai-tracker
bun install
```

`bun install` is also run automatically by `make` if `node_modules` is missing.

## Build and run

| Command | Description |
|---------|-------------|
| `make` | Compile TypeScript to `dist/` and compile GSettings schemas |
| `make install` | Build, pack to `.zip`, and install the extension |
| `make run` | Install and launch a nested GNOME Shell session for testing |
| `make pack` | Build and produce `gnome-ai-tracker.zip` for distribution |
| `make clean` | Remove `dist/`, `node_modules/`, `bun.lock`, and the zip |

### Iterating with `make run`

`make run` installs the extension and spawns a nested Wayland GNOME Shell session via:

```sh
dbus-run-session gnome-shell --devkit --wayland
```

This opens a self-contained desktop window. You can enable/disable and test the extension there without affecting your real session. Kill the window to exit.

After making code changes, re-run `make run` in the same terminal.

## Code quality

Before submitting changes, both checks must pass with exit code 0:

```sh
bun run typecheck
bun run lint
```

To auto-fix lint issues:
```sh
bun run lint:fix
```

## Reference documentation

- [GJS Guides](https://gjs.guide/guides/)
- [GNOME Shell Extension Guides](https://gjs.guide/extensions/)
- [GJS API Docs](https://gjs-docs.gnome.org/)
- [Porting to GNOME Shell 50](https://gjs.guide/extensions/upgrading/gnome-shell-50.html)
