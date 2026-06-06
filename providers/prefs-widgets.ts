import Adw from "gi://Adw";
import Gtk from "gi://Gtk?version=4.0";
import Gio from "gi://Gio";
import Soup from "gi://Soup?version=3.0";

import type { GettextFunc, IProvider } from "./base.js";

export interface ApiKeyGroupOptions
{
    /** Human-readable group title, e.g. "Authentication". */
    title: string;
    /** Description shown below the group title. */
    description: string;
    /** Row title label, e.g. "API Key" or "GitHub Token". */
    rowTitle: string;
    /** GSettings key to bind to the entry's text property. */
    settingsKey: string;
}

/**
 * Builds a standard authentication preferences group containing a single
 * masked password entry row bound to a GSettings key.
 */
export function buildApiKeyGroup(
    settings: Gio.Settings,
    options: ApiKeyGroupOptions,
    _: GettextFunc,
): Adw.PreferencesGroup
{
    const group = new Adw.PreferencesGroup({
        title: _(options.title),
        description: _(options.description),
    });

    const tokenRow = new Adw.PasswordEntryRow({
        title: _(options.rowTitle),
    });
    settings.bind(options.settingsKey, tokenRow, "text", Gio.SettingsBindFlags.DEFAULT);
    group.add(tokenRow);

    return group;
}

export interface PollingGroupOptions
{
    /** Settings key for the refresh interval (integer, seconds). */
    intervalKey: string;
    /** Settings key for the refresh trigger (integer, incremented to signal immediate refresh). */
    triggerKey: string;
    /** Settings key where the raw response string is stored. */
    rawResponseKey: string;
    provider: IProvider;
}

/**
 * Builds the standard polling preferences group with a spin row and a manual
 * refresh button. Shared by all providers that poll a remote API on a timer.
 */
export function buildPollingGroup(
    settings: Gio.Settings,
    options: PollingGroupOptions,
    _: GettextFunc,
): Adw.PreferencesGroup
{
    const group = new Adw.PreferencesGroup({
        title: _("Polling"),
    });

    const intervalRow = new Adw.SpinRow({
        title: _("Refresh interval"),
        subtitle: _("Seconds between API requests."),
        adjustment: new Gtk.Adjustment({
            lower: 60,
            upper: 3600,
            step_increment: 30,
            page_increment: 60,
            value: settings.get_int(options.intervalKey),
        }),
    });
    settings.bind(options.intervalKey, intervalRow, "value", Gio.SettingsBindFlags.DEFAULT);
    group.add(intervalRow);

    const session = new Soup.Session();

    const refreshButtonContent = new Adw.ButtonContent({
        label: _("Refresh now"),
        icon_name: "view-refresh-symbolic",
    });

    const refreshSpinner = new Gtk.Spinner({ spinning: false });

    const refreshStack = new Gtk.Stack();
    refreshStack.add_named(refreshButtonContent, "content");
    refreshStack.add_named(refreshSpinner, "spinner");

    const refreshButton = new Gtk.Button({
        halign: Gtk.Align.END,
        margin_top: 8,
        margin_bottom: 8,
        margin_end: 8,
        child: refreshStack,
    });

    let _isRefreshing = false;

    const setRefreshing = (active: boolean) =>
    {
        _isRefreshing = active;
        refreshButton.sensitive = !active;
        if (active)
        {
            refreshSpinner.spinning = true;
            refreshStack.visible_child_name = "spinner";
        }
        else
        {
            refreshStack.visible_child_name = "content";
            refreshSpinner.spinning = false;
        }
    };

    refreshButton.connect("clicked", () =>
    {
        if (_isRefreshing)
        {
            return;
        }

        setRefreshing(true);
        options.provider.fetchStatus(session, settings)
            .then(result =>
            {
                settings.set_string(options.rawResponseKey, result.rawResponse);
                settings.set_int(options.triggerKey, settings.get_int(options.triggerKey) + 1);
            })
            .catch(e => logError(e as Error, `${options.provider.id}.refreshButton`))
            .finally(() => setRefreshing(false));
    });
    group.add(refreshButton);

    return group;
}

export interface DebugGroupOptions
{
    /** Settings key where the raw response string is stored. */
    rawResponseKey: string;
    /** Human-readable description of the API the response came from. */
    apiDescription: string;
}

/**
 * Builds the standard debug preferences group with an expandable raw API
 * response viewer. Shared by all providers.
 */
export function buildDebugGroup(
    settings: Gio.Settings,
    options: DebugGroupOptions,
    _: GettextFunc,
): Adw.PreferencesGroup
{
    const group = new Adw.PreferencesGroup({
        title: _("Debug"),
    });

    const expanderRow = new Adw.ExpanderRow({
        title: _("Raw API Response"),
        subtitle: options.apiDescription,
    });
    group.add(expanderRow);

    const textView = new Gtk.TextView({
        editable: false,
        monospace: true,
        wrap_mode: Gtk.WrapMode.WORD_CHAR,
        top_margin: 8,
        bottom_margin: 8,
        left_margin: 8,
        right_margin: 8,
    });

    const scrolledWindow = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vscrollbar_policy: Gtk.PolicyType.NEVER,
        propagate_natural_height: true,
    });
    scrolledWindow.set_child(textView);

    const updateText = () =>
    {
        const raw = settings.get_string(options.rawResponseKey);
        let formatted = raw;
        if (raw)
        {
            try
            {
                formatted = JSON.stringify(JSON.parse(raw), null, 2);
            }
            catch
            {
                // leave as-is if not valid JSON
            }
        }
        textView.buffer.set_text(formatted || _("No data yet — waiting for the first API poll."), -1);
    };

    updateText();
    settings.connect(`changed::${options.rawResponseKey}`, updateText);

    expanderRow.add_row(scrolledWindow);

    return group;
}
