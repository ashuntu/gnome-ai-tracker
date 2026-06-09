/* prefs.ts
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

import Adw from "gi://Adw";
import Gdk from "gi://Gdk?version=4.0";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk?version=4.0";
import Gio from "gi://Gio";
import Soup from "gi://Soup?version=3.0";

import { ExtensionPreferences, gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { PROVIDER_TYPES, loadInstances, saveInstances } from "./providers/index.js";
import type { IProviderType, ProviderInstance } from "./providers/index.js";
import { buildApiKeyGroup, buildPollingGroup, buildDebugGroup } from "./providers/prefs-widgets.js";

export default class AiTrackerPreferences extends ExtensionPreferences
{
    fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void>
    {
        const settings = this.getSettings("org.gnome.shell.extensions.gnome-ai-tracker");
        const extensionPath = this.path;

        window.set_search_enabled(false);

        _addGeneralPage(window, settings);
        _addProvidersPage(window, settings, extensionPath);

        return Promise.resolve();
    }
}

function _addGeneralPage(window: Adw.PreferencesWindow, settings: Gio.Settings): void
{
    const page = new Adw.PreferencesPage({
        title: _("General"),
        icon_name: "preferences-system-symbolic",
    });
    window.add(page);

    const group = new Adw.PreferencesGroup({
        title: _("Tray Icon"),
    });
    page.add(group);

    let modeEntries: Array<{ label: string; value: string }> = [];

    const stringList = new Gtk.StringList();

    const comboRow = new Adw.ComboRow({
        title: _("Display mode"),
        subtitle: _("What to show in the panel label"),
        model: stringList,
    });

    const rebuildEntries = () =>
    {
        const currentVal = settings.get_string("tray-display-mode") ?? "highest";

        modeEntries = [
            { label: _("All providers"), value: "all" },
            { label: _("Highest usage"), value: "highest" },
        ];

        const instances = loadInstances(settings);
        for (const instance of instances)
        {
            const providerType = PROVIDER_TYPES.find(t => t.id === instance.typeId);
            const label = instance.name || providerType?.displayName || instance.uuid;
            modeEntries.push({ label, value: `instance:${instance.uuid}` });
        }

        const n = stringList.get_n_items();
        for (let i = n - 1; i >= 0; i--)
        {
            stringList.remove(i);
        }
        for (const entry of modeEntries)
        {
            stringList.append(entry.label);
        }

        const idx = modeEntries.findIndex(e => e.value === currentVal);
        comboRow.set_selected(idx >= 0 ? idx : 0);
    };

    rebuildEntries();

    comboRow.connect("notify::selected", () =>
    {
        const idx = comboRow.get_selected();
        const entry = modeEntries[idx];
        if (entry)
        {
            settings.set_string("tray-display-mode", entry.value);
        }
    });

    settings.connect("changed::tray-display-mode", () =>
    {
        const val = settings.get_string("tray-display-mode") ?? "highest";
        const idx = modeEntries.findIndex(e => e.value === val);
        if (idx >= 0 && comboRow.get_selected() !== idx)
        {
            comboRow.set_selected(idx);
        }
    });

    settings.connect("changed::provider-instances", rebuildEntries);

    group.add(comboRow);
}

function _addProvidersPage(
    window: Adw.PreferencesWindow,
    settings: Gio.Settings,
    extensionPath: string,
): void
{
    const page = new Adw.PreferencesPage({
        title: _("Providers"),
        icon_name: "applications-science-symbolic",
    });
    window.add(page);

    const group = new Adw.PreferencesGroup({
        title: _("Configured Providers"),
    });
    page.add(group);

    const addButton = new Gtk.Button({
        label: _("Add Provider"),
        halign: Gtk.Align.END,
        margin_top: 8,
        margin_bottom: 8,
        css_classes: ["suggested-action"],
    });

    addButton.connect("clicked", () =>
    {
        _pushAddProviderPage(window, settings);
    });

    const instanceRows: InstanceType<typeof ProviderRow>[] = [];

    const rebuildRows = () =>
    {
        for (const row of instanceRows)
        {
            group.remove(row);
        }
        instanceRows.length = 0;

        const instances = loadInstances(settings);
        for (const instance of instances)
        {
            const providerType = PROVIDER_TYPES.find(t => t.id === instance.typeId);
            if (!providerType)
            {
                continue;
            }
            const row = _buildInstanceRow(window, settings, extensionPath, instance, providerType);
            group.add(row);
            instanceRows.push(row);
        }
    };

    group.add(addButton);

    rebuildRows();

    settings.connect("changed::provider-instances", rebuildRows);
}

// Registered GObject subclass so its GType can be used as the DnD transfer type.
const ProviderRow = GObject.registerClass(
    { GTypeName: "AiTrackerProviderRow" },
    class ProviderRow extends Adw.ActionRow
    {
        public instanceUuid: string = "";
    },
);

function _buildInstanceRow(
    window: Adw.PreferencesWindow,
    settings: Gio.Settings,
    extensionPath: string,
    instance: ProviderInstance,
    providerType: IProviderType,
): InstanceType<typeof ProviderRow>
{
    const displayName = instance.name || providerType.displayName;

    const row = new ProviderRow({
        title: displayName,
        subtitle: providerType.displayName,
        activatable: true,
    });
    row.instanceUuid = instance.uuid;

    let prefixImage: Gtk.Image;
    if (providerType.iconPath)
    {
        const file = Gio.File.new_for_path(`${extensionPath}/${providerType.iconPath}`);
        prefixImage = new Gtk.Image({
            gicon: new Gio.FileIcon({ file }),
            pixel_size: 32,
        });
    }
    else
    {
        prefixImage = new Gtk.Image({
            icon_name: providerType.iconName,
            pixel_size: 32,
        });
    }
    row.add_prefix(prefixImage);

    const handle = new Gtk.Image({
        icon_name: "list-drag-handle-symbolic",
        css_classes: ["dim-label"],
        valign: Gtk.Align.CENTER,
    });
    row.add_prefix(handle);

    const toggle = new Gtk.Switch({
        valign: Gtk.Align.CENTER,
        active: instance.enabled,
    });

    toggle.connect("notify::active", () =>
    {
        const instances = loadInstances(settings);
        const idx = instances.findIndex(i => i.uuid === instance.uuid);
        if (idx >= 0)
        {
            instances[idx].enabled = toggle.get_active();
            saveInstances(settings, instances);
        }
    });

    row.add_suffix(toggle);
    row.add_suffix(new Gtk.Image({ icon_name: "go-next-symbolic" }));

    row.connect("activated", () =>
    {
        _pushInstanceSettingsPage(window, settings, instance, providerType);
    });

    const dragSource = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE });
    dragSource.connect("prepare", () => Gdk.ContentProvider.new_for_value(row));
    dragSource.connect("drag-begin", (_src, drag) =>
    {
        const dragRow = new ProviderRow({
            title: displayName,
            subtitle: providerType.displayName,
            width_request: row.get_width(),
            height_request: row.get_height(),
        });
        const listBox = new Gtk.ListBox({
            css_classes: ["boxed-list"],
        });
        listBox.append(dragRow);
        Gtk.DragIcon.get_for_drag(drag).set_child(listBox);
    });
    row.add_controller(dragSource);

    const dropTarget = Gtk.DropTarget.new(ProviderRow.$gtype, Gdk.DragAction.MOVE);
    dropTarget.connect("drop", (_target, src: InstanceType<typeof ProviderRow>) =>
    {
        if (src.instanceUuid === row.instanceUuid)
        {
            return false;
        }
        const instances = loadInstances(settings);
        const fromIdx = instances.findIndex(i => i.uuid === src.instanceUuid);
        const toIdx = instances.findIndex(i => i.uuid === row.instanceUuid);
        if (fromIdx < 0 || toIdx < 0)
        {
            return false;
        }
        const [moved] = instances.splice(fromIdx, 1);
        instances.splice(toIdx, 0, moved);
        saveInstances(settings, instances);
        return true;
    });
    row.add_controller(dropTarget);

    return row;
}

function _pushAddProviderPage(
    window: Adw.PreferencesWindow,
    settings: Gio.Settings,
): void
{
    const page = new Adw.PreferencesPage();

    const typeGroup = new Adw.PreferencesGroup({
        title: _("Provider Type"),
        description: _("Select which AI service to connect."),
    });
    page.add(typeGroup);

    const typeStringList = new Gtk.StringList();
    for (const pt of PROVIDER_TYPES)
    {
        typeStringList.append(pt.displayName);
    }

    const typeRow = new Adw.ComboRow({
        title: _("Provider"),
        model: typeStringList,
        selected: 0,
    });
    typeGroup.add(typeRow);

    const detailsGroup = new Adw.PreferencesGroup({
        title: _("Details"),
    });
    page.add(detailsGroup);

    const nameRow = new Adw.EntryRow({
        title: _("Custom name (optional)"),
    });
    detailsGroup.add(nameRow);

    const apiKeyRow = new Adw.PasswordEntryRow({
        title: _("API Key / Token"),
    });
    detailsGroup.add(apiKeyRow);

    const actionsGroup = new Adw.PreferencesGroup();
    page.add(actionsGroup);

    const buttonContent = new Adw.ButtonContent({
        label: _("Add Provider"),
        icon_name: "list-add-symbolic",
    });

    const spinner = new Gtk.Spinner({ spinning: false });

    const buttonStack = new Gtk.Stack();
    buttonStack.add_named(buttonContent, "content");
    buttonStack.add_named(spinner, "spinner");

    const addButton = new Gtk.Button({
        halign: Gtk.Align.END,
        margin_top: 8,
        margin_bottom: 8,
        css_classes: ["suggested-action"],
        child: buttonStack,
    });

    actionsGroup.add(addButton);

    const toolbarView = new Adw.ToolbarView();
    toolbarView.add_top_bar(new Adw.HeaderBar());

    const errorBanner = new Adw.Banner({
        title: _("Authentication failed. Check your API key and provider type."),
        button_label: "",
        revealed: false,
    });
    toolbarView.add_top_bar(errorBanner);
    toolbarView.set_content(page);

    let _isValidating = false;

    const setValidating = (active: boolean) =>
    {
        _isValidating = active;
        addButton.sensitive = !active;
        typeRow.sensitive = !active;
        nameRow.sensitive = !active;
        apiKeyRow.sensitive = !active;
        if (active)
        {
            spinner.spinning = true;
            buttonStack.visible_child_name = "spinner";
        }
        else
        {
            buttonStack.visible_child_name = "content";
            spinner.spinning = false;
        }
    };

    const session = new Soup.Session();

    addButton.connect("clicked", () =>
    {
        if (_isValidating)
        {
            return;
        }

        const typeIdx = typeRow.get_selected();
        const providerType = PROVIDER_TYPES[typeIdx];
        if (!providerType)
        {
            return;
        }

        errorBanner.revealed = false;
        setValidating(true);

        const candidateInstance: ProviderInstance = {
            uuid: _generateUuid(),
            typeId: providerType.id,
            name: nameRow.get_text().trim(),
            apiKey: apiKeyRow.get_text(),
            enabled: true,
            rawResponse: "",
        };

        providerType.fetchStatus(session, candidateInstance)
            .then(result =>
            {
                candidateInstance.rawResponse = result.rawResponse;
                const instances = loadInstances(settings);
                instances.push(candidateInstance);
                saveInstances(settings, instances);
                window.pop_subpage();
            })
            .catch(_err =>
            {
                errorBanner.revealed = true;
            })
            .finally(() => setValidating(false));
    });

    const navPage = new Adw.NavigationPage({
        title: _("Add Provider"),
        child: toolbarView,
    });

    window.push_subpage(navPage);
}

function _pushInstanceSettingsPage(
    window: Adw.PreferencesWindow,
    settings: Gio.Settings,
    instance: ProviderInstance,
    providerType: IProviderType,
): void
{
    const page = new Adw.PreferencesPage();

    const infoGroup = new Adw.PreferencesGroup({
        title: _("Identity"),
    });
    page.add(infoGroup);

    const nameRow = new Adw.EntryRow({
        title: _("Custom name"),
        text: instance.name,
    });

    nameRow.connect("notify::text", () =>
    {
        const instances = loadInstances(settings);
        const idx = instances.findIndex(i => i.uuid === instance.uuid);
        if (idx >= 0)
        {
            instances[idx].name = nameRow.get_text().trim();
            saveInstances(settings, instances);
        }
    });

    infoGroup.add(nameRow);

    let apiKeyGroupTitle: string;
    let apiKeyGroupDesc: string;
    let apiKeyRowTitle: string;

    if (providerType.id === "github-copilot")
    {
        apiKeyGroupTitle = "Authentication";
        apiKeyGroupDesc = "Provide a GitHub token with Copilot access. Run `gh auth token` in a terminal to get your current token.";
        apiKeyRowTitle = "GitHub Token";
    }
    else
    {
        apiKeyGroupTitle = "Authentication";
        apiKeyGroupDesc = "Provide an API key for this provider.";
        apiKeyRowTitle = "API Key";
    }

    page.add(buildApiKeyGroup(settings, instance, {
        title: apiKeyGroupTitle,
        description: apiKeyGroupDesc,
        rowTitle: apiKeyRowTitle,
    }, _));

    page.add(buildPollingGroup(settings, {
        intervalKey: "refresh-interval",
        triggerKey: "refresh-trigger",
        provider: providerType,
        instance,
    }, _));

    page.add(buildDebugGroup(settings, { instance }, _));

    const dangerGroup = new Adw.PreferencesGroup({
        title: _("Danger Zone"),
    });
    page.add(dangerGroup);

    const deleteButton = new Gtk.Button({
        label: _("Remove Provider"),
        halign: Gtk.Align.END,
        margin_top: 8,
        margin_bottom: 8,
        css_classes: ["destructive-action"],
    });

    deleteButton.connect("clicked", () =>
    {
        const instances = loadInstances(settings);
        const filtered = instances.filter(i => i.uuid !== instance.uuid);
        saveInstances(settings, filtered);
        window.pop_subpage();
    });

    dangerGroup.add(deleteButton);

    const toolbarView = new Adw.ToolbarView();
    toolbarView.add_top_bar(new Adw.HeaderBar());
    toolbarView.set_content(page);

    const title = instance.name || providerType.displayName;
    const navPage = new Adw.NavigationPage({
        title,
        child: toolbarView,
    });

    window.push_subpage(navPage);
}

function _generateUuid(): string
{
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++)
    {
        bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}
