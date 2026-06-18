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
    /** Full list of metrics shown in the popup menu, in the same order as `IProviderType.metricLabels`. */
    metrics: ProviderMetric[];
    /** Raw response body, stored for debug display. */
    rawResponse: string;
}

/**
 * Serialisable data for a single configured provider instance.
 * Stored as JSON inside the `provider-instances` GSettings key.
 */
export interface ProviderInstance
{
    /** Unique identifier for this instance (UUID). */
    uuid: string;
    /** Which provider type this is (matches IProviderType.id). */
    typeId: string;
    /** User-defined display name, e.g. "Work Copilot". */
    name: string;
    /** API key / token for this instance. */
    apiKey: string;
    /** Whether this instance is actively polled. */
    enabled: boolean;
    /** Last raw API response stored for debug display. */
    rawResponse: string;
}

/**
 * Static description and fetch logic for a provider type.
 *
 * Implementations are plain objects (singletons) that know how to
 * fetch data and build prefs UI for any ProviderInstance of their type.
 */
export interface IProviderType
{
    /** Unique identifier matching ProviderInstance.typeId. */
    readonly id: string;
    /** Human-readable type name shown when selecting a provider type. */
    readonly displayName: string;
    /** One-line description of this provider type. */
    readonly description: string;
    /** Fallback icon name (from the icon theme). */
    readonly iconName: string;
    /**
     * Path to a bundled SVG icon, relative to the extension directory.
     * When set, takes precedence over iconName.
     */
    readonly iconPath?: string;
    /**
     * Ordered list of metric labels this provider type always returns.
     * Used to pre-create popup menu items at setup time. The `metrics` array
     * returned by `fetchStatus` must be in this same order.
     */
    readonly metricLabels: readonly string[];

    /**
     * Fetch current usage data from the remote API.
     * Receives the instance so it can read apiKey.
     */
    fetchStatus(
        session: InstanceType<typeof Soup.Session>,
        instance: ProviderInstance,
    ): Promise<ProviderStatus>;
}

/** Deserialise the provider-instances settings key into an array of ProviderInstance. */
export function loadInstances(settings: Gio.Settings): ProviderInstance[]
{
    const raw = settings.get_strv("provider-instances");
    const result: ProviderInstance[] = [];
    for (const entry of raw)
    {
        try
        {
            result.push(JSON.parse(entry) as ProviderInstance);
        }
        catch
        {
            // skip corrupt entries
        }
    }
    return result;
}

/** Serialise a ProviderInstance array back into the settings key. */
export function saveInstances(settings: Gio.Settings, instances: ProviderInstance[]): void
{
    settings.set_strv("provider-instances", instances.map(i => JSON.stringify(i)));
}
