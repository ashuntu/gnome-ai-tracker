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

import type { IProviderType, ProviderInstance, ProviderMetric } from "./providers/index.js";
import { loadInstances, PROVIDER_TYPES } from "./providers/index.js";

const AiTrackerIndicator = GObject.registerClass(
    class AiTrackerIndicator extends PanelMenu.Button
    {
        private _box: InstanceType<typeof St.BoxLayout> | null = null;
        private _settings: Gio.Settings | null = null;
        private _session: InstanceType<typeof Soup.Session> | null = null;
        private _extensionPath: string = "";
        private _refreshTimerId: ReturnType<typeof GLib.timeout_add> | null = null;

        private _instancesChangedId: number | null = null;
        private _refreshTriggerChangedId: number | null = null;
        private _displayModeChangedId: number | null = null;

        /** Menu items keyed by `${instance.uuid}:${metric.label}`. */
        private _metricItems: Map<string, InstanceType<typeof PopupMenu.PopupMenuItem>> = new Map();

        /** Separator + metric items for each instance, keyed by instance.uuid. */
        private _instanceMenuActors: Map<string, InstanceType<typeof PopupMenu.PopupBaseMenuItem>[]> = new Map();

        /** The static menu items that appear after instance sections (separator + prefs link). */
        private _footerActors: InstanceType<typeof PopupMenu.PopupBaseMenuItem>[] = [];

        /** Last successful panelText per instance, keyed by instance.uuid. */
        private _lastPanelTexts: Map<string, string> = new Map();

        /** Last highest percent value seen across all instances. */
        private _lastHighestPercent: number | null = null;

        _init()
        {
            super._init(0.5, _("AI Usage Tracker"));
        }

        setup(settings: Gio.Settings, extensionPath: string, openPrefs: () => void)
        {
            this._settings = settings;
            this._extensionPath = extensionPath;
            this._session = new Soup.Session();

            const box = new St.BoxLayout({
                style_class: "ai-tracker-box",
                y_align: Clutter.ActorAlign.CENTER,
                x_align: Clutter.ActorAlign.CENTER,
            });
            this._box = box;
            this.add_child(box);

            if (this.menu instanceof PopupMenu.PopupMenu)
            {
                const footerSep = new PopupMenu.PopupSeparatorMenuItem();
                this.menu.addMenuItem(footerSep);
                this._footerActors.push(footerSep);

                const openPrefsItem = new PopupMenu.PopupMenuItem(_("Preferences…"));
                openPrefsItem.connect("activate", () => openPrefs());
                this.menu.addMenuItem(openPrefsItem);
                this._footerActors.push(openPrefsItem);
            }

            this._instancesChangedId = settings.connect("changed::provider-instances", () =>
            {
                this._rebuildInstanceMenuSections();
                this._scheduleRefresh();
            });

            this._refreshTriggerChangedId = settings.connect("changed::refresh-trigger", () =>
            {
                this._scheduleRefresh();
            });

            this._displayModeChangedId = settings.connect("changed::tray-display-mode", () =>
            {
                this._applyDisplayMode();
            });

            this._rebuildInstanceMenuSections();
            this._scheduleRefresh();
        }

        private _getProviderType(instance: ProviderInstance): IProviderType | undefined
        {
            return PROVIDER_TYPES.find(t => t.id === instance.typeId);
        }

        private _rebuildInstanceMenuSections(): void
        {
            if (!this._settings || !(this.menu instanceof PopupMenu.PopupMenu))
            {
                return;
            }

            for (const actors of this._instanceMenuActors.values())
            {
                for (const actor of actors)
                {
                    actor.destroy();
                }
            }
            this._instanceMenuActors.clear();
            this._metricItems.clear();

            const instances = loadInstances(this._settings).filter(i => i.enabled);

            for (const footer of this._footerActors)
            {
                footer.visible = true;
            }

            for (const instance of instances)
            {
                const providerType = this._getProviderType(instance);
                if (!providerType)
                {
                    continue;
                }
                this._buildInstanceMenuSection(instance, providerType, this.menu);
            }

            for (const actors of this._instanceMenuActors.values())
            {
                for (const actor of actors)
                {
                    this.menu.moveMenuItem(actor, this.menu.numMenuItems - this._footerActors.length);
                }
            }

            this._applyDisplayMode();
        }

        private _buildInstanceMenuSection(
            instance: ProviderInstance,
            providerType: IProviderType,
            menu: InstanceType<typeof PopupMenu.PopupMenu>,
        ): void
        {
            const actors: InstanceType<typeof PopupMenu.PopupBaseMenuItem>[] = [];

            const displayName = instance.name || providerType.displayName;
            const separator = new PopupMenu.PopupSeparatorMenuItem(displayName);
            menu.addMenuItem(separator);
            actors.push(separator);

            for (const label of providerType.metricLabels)
            {
                const key = `${instance.uuid}:${label}`;
                const item = new PopupMenu.PopupMenuItem(`${label}: —`);
                item.sensitive = false;
                this._metricItems.set(key, item);
                menu.addMenuItem(item);
                actors.push(item);
            }

            this._instanceMenuActors.set(instance.uuid, actors);
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

            const allInstances = loadInstances(settings);
            const enabledInstances = allInstances.filter(i => i.enabled);

            if (enabledInstances.length === 0)
            {
                return;
            }

            let highestPercent: number | null = null;

            for (const instance of enabledInstances)
            {
                const providerType = this._getProviderType(instance);
                if (!providerType)
                {
                    continue;
                }

                if (!instance.apiKey)
                {
                    this._setInstanceMetrics(instance, providerType, []);
                    this._lastPanelTexts.set(instance.uuid, "–");
                    continue;
                }

                try
                {
                    const result = await providerType.fetchStatus(session, instance);

                    const instances = loadInstances(settings);
                    const idx = instances.findIndex(i => i.uuid === instance.uuid);
                    if (idx >= 0)
                    {
                        instances[idx].rawResponse = result.rawResponse;
                        saveInstances(settings, instances);
                    }

                    this._setInstanceMetrics(instance, providerType, result.metrics);
                    this._lastPanelTexts.set(instance.uuid, result.panelText);

                    for (const metric of result.metrics)
                    {
                        if (metric.percent !== undefined && (highestPercent === null || metric.percent > highestPercent))
                        {
                            highestPercent = metric.percent;
                        }
                    }
                }
                catch (e)
                {
                    logError(e as Error, `AiTrackerIndicator._refresh[${instance.uuid}]`);
                    this._setInstanceMetrics(instance, providerType, []);
                    this._lastPanelTexts.set(instance.uuid, "!");
                }
            }

            this._lastHighestPercent = highestPercent;
            this._applyDisplayMode();
        }

        private _makeProviderIcon(providerType: IProviderType): InstanceType<typeof St.Icon>
        {
            if (providerType.iconPath)
            {
                const file = Gio.File.new_for_path(`${this._extensionPath}/${providerType.iconPath}`);
                const gicon = new Gio.FileIcon({ file });
                return new St.Icon({
                    gicon,
                    style_class: "system-status-icon ai-tracker-icon",
                    y_align: Clutter.ActorAlign.CENTER,
                });
            }
            return new St.Icon({
                gicon: Gio.ThemedIcon.new(providerType.iconName),
                style_class: "system-status-icon ai-tracker-icon",
                y_align: Clutter.ActorAlign.CENTER,
            });
        }

        private _applyDisplayMode(): void
        {
            if (!this._box || !this._settings)
            {
                return;
            }

            this._box.remove_all_children();

            const mode = this._settings.get_string("tray-display-mode") ?? "highest";
            const enabledInstances = loadInstances(this._settings).filter(i => i.enabled);

            if (enabledInstances.length === 0)
            {
                this._box.add_child(new St.Icon({
                    gicon: Gio.ThemedIcon.new("computer-symbolic"),
                    style_class: "system-status-icon ai-tracker-icon",
                    y_align: Clutter.ActorAlign.CENTER,
                }));
                this._box.add_child(new St.Label({
                    text: "—",
                    y_align: Clutter.ActorAlign.CENTER,
                    style_class: "ai-tracker-label",
                }));
                return;
            }

            if (mode === "all")
            {
                for (const instance of enabledInstances)
                {
                    const providerType = this._getProviderType(instance);
                    if (!providerType)
                    {
                        continue;
                    }
                    const text = this._lastPanelTexts.get(instance.uuid) ?? "—";
                    this._box.add_child(this._makeProviderIcon(providerType));
                    this._box.add_child(new St.Label({
                        text,
                        y_align: Clutter.ActorAlign.CENTER,
                        style_class: "ai-tracker-label",
                    }));
                }
                return;
            }

            let displayInstance: ProviderInstance | undefined;
            let displayText: string;

            if (mode === "highest")
            {
                let highestUuid: string | undefined;
                let highestVal = -Infinity;
                for (const instance of enabledInstances)
                {
                    const text = this._lastPanelTexts.get(instance.uuid) ?? "";
                    const pct = parseFloat(text);
                    if (!isNaN(pct) && pct > highestVal)
                    {
                        highestVal = pct;
                        highestUuid = instance.uuid;
                    }
                }
                displayInstance = enabledInstances.find(i => i.uuid === highestUuid) ?? enabledInstances[0];
                displayText = this._lastHighestPercent !== null
                    ? `${this._lastHighestPercent.toFixed(2)}%`
                    : (this._lastPanelTexts.get(displayInstance.uuid) ?? "—");
            }
            else if (mode.startsWith("instance:"))
            {
                const targetUuid = mode.slice("instance:".length);
                displayInstance = enabledInstances.find(i => i.uuid === targetUuid) ?? enabledInstances[0];
                displayText = this._lastPanelTexts.get(displayInstance.uuid) ?? "—";
            }
            else
            {
                displayInstance = enabledInstances[0];
                displayText = this._lastPanelTexts.get(displayInstance.uuid) ?? "—";
            }

            const providerType = this._getProviderType(displayInstance);
            if (providerType)
            {
                this._box.add_child(this._makeProviderIcon(providerType));
            }
            else
            {
                this._box.add_child(new St.Icon({
                    gicon: Gio.ThemedIcon.new("computer-symbolic"),
                    style_class: "system-status-icon ai-tracker-icon",
                    y_align: Clutter.ActorAlign.CENTER,
                }));
            }
            this._box.add_child(new St.Label({
                text: displayText,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: "ai-tracker-label",
            }));
        }

        private _setInstanceMetrics(instance: ProviderInstance, providerType: IProviderType, metrics: ProviderMetric[]): void
        {
            for (const label of providerType.metricLabels)
            {
                const key = `${instance.uuid}:${label}`;
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
                const percentPart = metric.percent !== undefined ? `${metric.percent.toFixed(2)}%` : null;

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

        destroy()
        {
            if (this._refreshTimerId !== null)
            {
                GLib.source_remove(this._refreshTimerId);
                this._refreshTimerId = null;
            }
            if (this._settings)
            {
                if (this._instancesChangedId !== null)
                {
                    this._settings.disconnect(this._instancesChangedId);
                    this._instancesChangedId = null;
                }
                if (this._refreshTriggerChangedId !== null)
                {
                    this._settings.disconnect(this._refreshTriggerChangedId);
                    this._refreshTriggerChangedId = null;
                }
                if (this._displayModeChangedId !== null)
                {
                    this._settings.disconnect(this._displayModeChangedId);
                    this._displayModeChangedId = null;
                }
            }
            this._metricItems.clear();
            this._instanceMenuActors.clear();
            this._footerActors = [];
            this._lastPanelTexts.clear();
            this._lastHighestPercent = null;
            this._session = null;
            this._settings = null;
            this._box = null;
            super.destroy();
        }
    });

function saveInstances(settings: Gio.Settings, instances: ProviderInstance[]): void
{
    settings.set_strv("provider-instances", instances.map(i => JSON.stringify(i)));
}

export default class AiTrackerExtension extends Extension
{
    private _indicator: InstanceType<typeof AiTrackerIndicator> | null = null;

    enable()
    {
        const settings = this.getSettings("org.gnome.shell.extensions.gnome-ai-tracker");
        this._indicator = new AiTrackerIndicator();
        this._indicator.setup(settings, this.path, () => this.openPreferences());
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable()
    {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
