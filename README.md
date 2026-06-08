# AI Usage Tracker GNOME Extension

Tracks your AI usage limits across various providers.

## Install from GitHub CI

1. Go to the [Actions](https://github.com/ashuntu/gnome-ai-tracker/actions) tab
2. Click the latest workflow run on `main`
3. Download the `gnome-ai-tracker` artifact
4. Run:
   ```sh
   gnome-extensions install --force gnome-ai-tracker.zip
   ```

## Build and Install from Source

```sh
git clone https://github.com/ashuntu/gnome-ai-tracker.git
cd gnome-ai-tracker
make install
```

Log out and back in, then enable the extension:

```sh
gnome-extensions enable gnome-ai-tracker@example.com
```
