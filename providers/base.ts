import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Soup from "gi://Soup?version=3.0";

/** Gettext translate function, injected so providers work in both extension and prefs contexts. */
export type GettextFunc = (s: string) => string;

/** A single named usage metric returned by a provider. */
export interface ProviderMetric
       {
    /** Human-readable label, e.g. "Copilot Premium". */
    label: string;
    /** Formatted value to display, e.g. "42%", "∞", or "N/A". Used as fallback when spend/percent are absent. */
    value: string;
    /** Dollar spend amount, if available. Used to compose "$x (y%)" display format. */
    spend?: number;
    /** Usage as a percentage (0–100), if available. Used to compose "$x (y%)" display format. */
    percent?: number;
}

/** The result of a successful provider fetch. */
export interface ProviderStatus
       {
    /** Value shown in the panel label (primary metric). */
    panelText: string;
    /** Full list of metrics shown in the popup menu. */
    metrics: ProviderMetric[];
    /** Raw response body, stored for debug display. */
    rawResponse: string;
}

/**
 * All provider implementations must satisfy this interface.
 *
 * Implementations are plain objects (not GObject subclasses) constructed
 * once per extension enable/disable cycle. They receive a shared Soup.Session
 * and a Gio.Settings instance so they can read their own credentials and
 * persist their last raw response.
 */
export interface IProvider
       {
    /** Unique identifier, used as GSettings key prefix and for logging. */
    readonly id: string;
    /** Display name shown in the panel tooltip and prefs list. */
    readonly displayName: string;
    /** One-line description shown as the subtitle in the prefs provider row. */
    readonly description: string;
    /** Icon name used for the panel indicator and the prefs row. */
    readonly iconName: string;
    /**
     * Path to a bundled SVG icon, relative to the extension directory.
     * When set, takes precedence over iconName for display purposes.
     * e.g. "icons/copilot-symbolic.svg"
     */
    readonly iconPath?: string;
    /**
     * The GSettings key that holds this provider's API token/key.
     * Used by the extension to skip fetching when the token is absent.
     */
    readonly settingsTokenKey: string;
    /**
     * The GSettings key where the last raw API response is stored.
     * Used by the extension to persist responses and by prefs to display them.
     */
    readonly settingsRawResponseKey: string;
    /**
     * The GSettings key (boolean) controlling whether this provider is active.
     * When false the extension skips polling and hides the provider from the menu.
     */
    readonly settingsEnabledKey: string;
    /**
     * Ordered list of metric labels this provider will always return.
     * Used to pre-create popup menu items in the correct position at setup time.
     */
    readonly metricLabels: readonly string[];

    /**
     * Fetch current usage data from the remote API.
     * Must not throw — return a rejected promise on error so the caller can
     * catch and display an error state.
     */
    fetchStatus(session: InstanceType<typeof Soup.Session>, settings: Gio.Settings): Promise<ProviderStatus>;

    /**
     * Build the Adwaita preferences page for this provider.
     * Called lazily when the user navigates to the provider in prefs.
     * Receives the shared gettext function so strings are translated in the
     * prefs process rather than the extension process.
     */
    buildPrefsPage(settings: Gio.Settings, gettext: GettextFunc): Adw.PreferencesPage;
}
