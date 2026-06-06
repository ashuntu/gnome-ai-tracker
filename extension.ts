/* extension.ts
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup?version=3.0";

import { Extension, gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import type { IProvider, ProviderMetric } from "./providers/index.js";
import { PROVIDERS } from "./providers/index.js";

const AiTrackerIndicator = GObject.registerClass(
    class AiTrackerIndicator extends PanelMenu.Button
    {
        private _label: InstanceType<typeof St.Label> | null = null;
        private _icon: InstanceType<typeof St.Icon> | null = null;
        private _settings: Gio.Settings | null = null;
        private _session: InstanceType<typeof Soup.Session> | null = null;
        private _refreshTimerId: ReturnType<typeof GLib.timeout_add> | null = null;
        private _settingsChangedIds: number[] = [];
        private _refreshTriggerChangedId: number | null = null;

        /** Menu items keyed by `${provider.id}:${metric.label}`. */
        private _metricItems: Map<string, InstanceType<typeof PopupMenu.PopupMenuItem>> = new Map();

        /** Separator + metric items for each provider, keyed by provider.id. */
        private _providerMenuActors: Map<string, InstanceType<typeof PopupMenu.PopupBaseMenuItem>[]> = new Map();

        _init()
        {
            super._init(0.5, _("AI Usage Tracker"));
        }

        setup(settings: Gio.Settings, openPrefs: () => void, extensionDir: string)
        {
            this._settings = settings;
            this._session = new Soup.Session();

            const box = new St.BoxLayout({
                style_class: "ai-tracker-box",
                y_align: Clutter.ActorAlign.CENTER,
                x_align: Clutter.ActorAlign.CENTER,
            });

            const provider = PROVIDERS.find(p => settings.get_boolean(p.settingsEnabledKey)) ?? PROVIDERS[0] ?? null;
            let gicon: Gio.Icon | null = null;
            if (provider?.iconPath)
            {
                const file = Gio.File.new_for_path(`${extensionDir}/${provider.iconPath}`);
                gicon = new Gio.FileIcon({ file });
            }

            this._icon = new St.Icon({
                gicon: gicon ?? Gio.ThemedIcon.new(provider?.iconName ?? "computer-symbolic"),
                style_class: "system-status-icon ai-tracker-icon",
                y_align: Clutter.ActorAlign.CENTER,
            });

            this._label = new St.Label({
                text: "—",
                y_align: Clutter.ActorAlign.CENTER,
                style_class: "ai-tracker-label",
            });

            box.add_child(this._icon);
            box.add_child(this._label);
            this.add_child(box);

            if (this.menu instanceof PopupMenu.PopupMenu)
            {
                for (const provider of PROVIDERS)
                {
                    this._buildProviderMenuSection(provider, this.menu);
                }

                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

                const openPrefsItem = new PopupMenu.PopupMenuItem(_("Preferences…"));
                openPrefsItem.connect("activate", () => openPrefs());
                this.menu.addMenuItem(openPrefsItem);
            }

            this._settingsChangedIds = PROVIDERS.flatMap(p =>
                [
                    settings.connect(`changed::${p.settingsTokenKey}`, () => this._scheduleRefresh()),
                    settings.connect(`changed::${p.settingsEnabledKey}`, () =>
                    {
                        this._applyProviderVisibility();
                        this._scheduleRefresh();
                    }),
                ]);

            this._refreshTriggerChangedId = this._settings.connect("changed::refresh-trigger", () =>
            {
                this._scheduleRefresh();
            });

            this._applyProviderVisibility();
            this._scheduleRefresh();
        }

        private _buildProviderMenuSection(
            provider: IProvider,
            menu: InstanceType<typeof PopupMenu.PopupMenu>,
        ): void
        {
            const actors: InstanceType<typeof PopupMenu.PopupBaseMenuItem>[] = [];

            const separator = new PopupMenu.PopupSeparatorMenuItem(provider.displayName);
            menu.addMenuItem(separator);
            actors.push(separator);

            for (const label of provider.metricLabels)
            {
                const key = `${provider.id}:${label}`;
                const item = new PopupMenu.PopupMenuItem(`${label}: —`);
                item.sensitive = false;
                this._metricItems.set(key, item);
                menu.addMenuItem(item);
                actors.push(item);
            }

            this._providerMenuActors.set(provider.id, actors);
        }

        private _applyProviderVisibility(): void
        {
            if (!this._settings)
            {
                return;
            }

            for (const provider of PROVIDERS)
            {
                const enabled = this._settings.get_boolean(provider.settingsEnabledKey);
                const actors = this._providerMenuActors.get(provider.id) ?? [];
                for (const actor of actors)
                {
                    actor.visible = enabled;
                }
            }
        }

        private _scheduleRefresh()
        {
            if (this._refreshTimerId !== null)
            {
                GLib.source_remove(this._refreshTimerId);
                this._refreshTimerId = null;
            }

            this._refresh().catch(e => logError(e as Error, "AiTrackerIndicator"));

            const interval = (this._settings?.get_int("refresh-interval") ?? 300) * 1000;
            this._refreshTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () =>
            {
                this._refresh().catch(e => logError(e as Error, "AiTrackerIndicator"));
                return GLib.SOURCE_CONTINUE;
            });
        }

        private async _refresh()
        {
            if (!this._session || !this._settings)
            {
                return;
            }

            const session = this._session;
            const settings = this._settings;

            const enabledProviders = PROVIDERS.filter(p => settings.get_boolean(p.settingsEnabledKey));

            if (enabledProviders.length === 0)
            {
                return;
            }

            const primaryProvider = enabledProviders[0];
            let primaryPanelText = "—";

            for (const provider of enabledProviders)
            {
                const token = settings.get_string(provider.settingsTokenKey) ?? "";
                if (!token)
                {
                    this._setProviderMetrics(provider, []);
                    if (provider === primaryProvider)
                    {
                        primaryPanelText = "–";
                    }
                    continue;
                }

                try
                {
                    const result = await provider.fetchStatus(session, settings);
                    settings.set_string(provider.settingsRawResponseKey, result.rawResponse);
                    this._setProviderMetrics(provider, result.metrics);
                    if (provider === primaryProvider)
                    {
                        primaryPanelText = result.panelText;
                    }
                }
                catch (e)
                {
                    logError(e as Error, `AiTrackerIndicator._refresh[${provider.id}]`);
                    this._setProviderMetrics(provider, []);
                    if (provider === primaryProvider)
                    {
                        primaryPanelText = "!";
                    }
                }
            }

            this._setLabel(primaryPanelText);
        }

        private _setProviderMetrics(provider: IProvider, metrics: ProviderMetric[]): void
        {
            for (const label of provider.metricLabels)
            {
                const key = `${provider.id}:${label}`;
                const item = this._metricItems.get(key);
                if (!item)
                {
                    continue;
                }

                const metric = metrics.find(m => m.label === label);
                if (!metric)
                {
                    item.label.set_text(`${label}: —`);
                    continue;
                }

                const spendPart = metric.spend !== undefined ? `$${metric.spend.toFixed(2)}` : null;
                const percentPart = metric.percent !== undefined ? `${metric.percent}%` : null;

                let displayValue: string;
                if (spendPart && percentPart)
                {
                    displayValue = `${spendPart} (${percentPart})`;
                }
                else if (spendPart)
                {
                    displayValue = spendPart;
                }
                else if (percentPart)
                {
                    displayValue = percentPart;
                }
                else
                {
                    displayValue = metric.value;
                }

                item.label.set_text(`${label}: ${displayValue}`);
            }
        }

        private _setLabel(text: string)
        {
            if (this._label)
            {
                this._label.set_text(text);
            }
        }

        destroy()
        {
            if (this._refreshTimerId !== null)
            {
                GLib.source_remove(this._refreshTimerId);
                this._refreshTimerId = null;
            }
            if (this._settingsChangedIds.length > 0 && this._settings)
            {
                for (const id of this._settingsChangedIds)
                {
                    this._settings.disconnect(id);
                }
                this._settingsChangedIds = [];
            }
            if (this._refreshTriggerChangedId !== null && this._settings)
            {
                this._settings.disconnect(this._refreshTriggerChangedId);
                this._refreshTriggerChangedId = null;
            }
            this._metricItems.clear();
            this._providerMenuActors.clear();
            this._session = null;
            this._settings = null;
            this._icon = null;
            this._label = null;
            super.destroy();
        }
    });

export default class AiTrackerExtension extends Extension
{
    private _indicator: InstanceType<typeof AiTrackerIndicator> | null = null;

    enable()
    {
        const settings = this.getSettings("org.gnome.shell.extensions.gnome-ai-tracker");
        this._indicator = new AiTrackerIndicator();
        this._indicator.setup(settings, () => this.openPreferences(), this.path);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable()
    {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
