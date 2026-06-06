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
import Gtk from "gi://Gtk?version=4.0";
import Gio from "gi://Gio";

import { ExtensionPreferences, gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { PROVIDERS } from "./providers/index.js";

export default class AiTrackerPreferences extends ExtensionPreferences
{
    fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void>
    {
        const settings = this.getSettings("org.gnome.shell.extensions.gnome-ai-tracker");

        window.set_search_enabled(false);

        const providersPage = new Adw.PreferencesPage({
            title: _("Providers"),
            icon_name: "applications-science-symbolic",
        });
        window.add(providersPage);

        const providersGroup = new Adw.PreferencesGroup({
            title: _("Configured Providers"),
        });
        providersPage.add(providersGroup);

        for (const provider of PROVIDERS)
        {
            _addProviderRow(window, providersGroup, settings, {
                title: provider.displayName,
                subtitle: provider.description,
                icon_name: provider.iconName,
                icon_path: provider.iconPath
                    ? `${this.path}/${provider.iconPath}`
                    : undefined,
                enabledKey: provider.settingsEnabledKey,
                buildPage: () => provider.buildPrefsPage(settings, _),
            });
        }

        return Promise.resolve();
    }
}

interface ProviderRowOptions
{
    title: string;
    subtitle: string;
    icon_name: string;
    icon_path?: string;
    enabledKey: string;
    buildPage: () => Adw.PreferencesPage;
}

function _addProviderRow(
    window: Adw.PreferencesWindow,
    group: Adw.PreferencesGroup,
    settings: Gio.Settings,
    options: ProviderRowOptions,
): void
{
    const row = new Adw.ActionRow({
        title: options.title,
        subtitle: options.subtitle,
        activatable: true,
    });

    let prefixImage: Gtk.Image;
    if (options.icon_path)
    {
        const file = Gio.File.new_for_path(options.icon_path);
        prefixImage = new Gtk.Image({
            gicon: new Gio.FileIcon({ file }),
            pixel_size: 32,
        });
    }
    else
    {
        prefixImage = new Gtk.Image({
            icon_name: options.icon_name,
            pixel_size: 32,
        });
    }
    row.add_prefix(prefixImage);

    const toggle = new Gtk.Switch({
        valign: Gtk.Align.CENTER,
    });
    settings.bind(options.enabledKey, toggle, "active", Gio.SettingsBindFlags.DEFAULT);
    row.add_suffix(toggle);

    row.add_suffix(new Gtk.Image({
        icon_name: "go-next-symbolic",
    }));

    row.connect("activated", () =>
    {
        const toolbarView = new Adw.ToolbarView();
        toolbarView.add_top_bar(new Adw.HeaderBar());
        toolbarView.set_content(options.buildPage());

        const navPage = new Adw.NavigationPage({
            title: options.title,
            child: toolbarView,
        });
        window.push_subpage(navPage);
    });

    group.add(row);
}
