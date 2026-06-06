import Adw from "gi://Adw";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup?version=3.0";

Gio._promisify(Soup.Session.prototype, "send_and_read_async", "send_and_read_finish");

import type { GettextFunc, IProvider, ProviderMetric, ProviderStatus } from "./base.js";
import { buildApiKeyGroup, buildDebugGroup, buildPollingGroup } from "./prefs-widgets.js";

const API_URL = "https://api.github.com/copilot_internal/user";

interface QuotaSnapshot
{
    entitlement: number;
    has_quota: boolean;
    overage_count: number;
    overage_permitted: boolean;
    percent_remaining: number;
    quota_id: string;
    quota_remaining: number;
    quota_reset_at: number;
    remaining: number;
    timestamp_utc: string;
    token_based_billing: boolean;
    unlimited: boolean;
}

interface CopilotUserResponse
{
    quota_snapshots?: {
        premium_interactions?: QuotaSnapshot;
        chat?: QuotaSnapshot;
        completions?: QuotaSnapshot;
    };
}

type QuotaKey = "premium_interactions" | "chat" | "completions";

const QUOTA_LABELS: Record<QuotaKey, string> = {
    premium_interactions: "Premium",
    chat: "Chat",
    completions: "Completions",
};

const QUOTA_KEYS: QuotaKey[] = ["premium_interactions", "chat", "completions"];

function _formatSnapshot(snapshot: QuotaSnapshot | undefined, label: string): string
{
    if (!snapshot)
    {
        return `${label}: N/A`;
    }
    if (snapshot.unlimited)
    {
        return `${label}: ∞`;
    }
    const used = snapshot.entitlement - snapshot.remaining;
    const pct = snapshot.entitlement > 0
        ? parseFloat(((used / snapshot.entitlement) * 100).toFixed(2))
        : 0;
    return `${label}: ${pct}%`;
}

function _formatPanelText(snapshot: QuotaSnapshot | undefined): string
{
    if (!snapshot)
    {
        return "N/A";
    }
    if (snapshot.unlimited)
    {
        return "∞";
    }
    const used = snapshot.entitlement - snapshot.remaining;
    const pct = snapshot.entitlement > 0
        ? parseFloat(((used / snapshot.entitlement) * 100).toFixed(2))
        : 0;
    return `${pct}%`;
}

export const GitHubCopilotProvider: IProvider = {
    id: "github-copilot",
    displayName: "GitHub Copilot",
    description: "Premium interactions and chat usage",
    iconName: "computer-symbolic",
    iconPath: "icons/copilot-symbolic.svg",
    settingsTokenKey: "github-token",
    settingsRawResponseKey: "last-raw-response",
    settingsEnabledKey: "github-copilot-enabled",
    metricLabels: QUOTA_KEYS.map(k => QUOTA_LABELS[k]),

    async fetchStatus(
        session: InstanceType<typeof Soup.Session>,
        settings: Gio.Settings,
    ): Promise<ProviderStatus>
    {
        const token = settings.get_string("github-token") ?? "";
        if (!token)
        {
            throw new Error("No GitHub token configured");
        }

        const message = Soup.Message.new("GET", API_URL);
        if (!message)
        {
            throw new Error(`Failed to construct Soup.Message for ${API_URL}`);
        }

        const headers = message.get_request_headers();
        headers.append("Authorization", `Bearer ${token}`);
        headers.append("Accept", "application/vnd.github+json");
        headers.append("X-GitHub-Api-Version", "2022-11-28");
        headers.append("User-Agent", "gnome-ai-tracker/1.0");

        const bytes = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);

        const status = message.get_status();
        if (status !== Soup.Status.OK)
        {
            throw new Error(`GitHub API returned HTTP ${status}`);
        }

        const decoder = new TextDecoder("utf-8");
        const raw = decoder.decode(bytes.get_data() ?? new Uint8Array());
        const data = JSON.parse(raw) as CopilotUserResponse;

        const snapshots = data?.quota_snapshots;
        const primary = snapshots?.premium_interactions;

        const panelText = _formatPanelText(primary);

        const metrics: ProviderMetric[] = QUOTA_KEYS.map(key =>
        {
            const snap = snapshots?.[key];
            const metric: ProviderMetric = {
                label: QUOTA_LABELS[key],
                value: _formatSnapshot(snap, QUOTA_LABELS[key]),
            };
            if (snap && !snap.unlimited && snap.entitlement > 0)
            {
                const used = snap.entitlement - snap.quota_remaining;
                metric.spend = used / 100;
                metric.percent = parseFloat(((used / snap.entitlement) * 100).toFixed(2));
            }
            return metric;
        });

        return { panelText, metrics, rawResponse: raw };
    },

    buildPrefsPage(settings: Gio.Settings, _: GettextFunc): Adw.PreferencesPage
    {
        const page = new Adw.PreferencesPage();

        page.add(buildApiKeyGroup(settings, {
            title: "Authentication",
            description: "Provide a GitHub token with Copilot access. Run `gh auth token` in a terminal to get your current token.",
            rowTitle: "GitHub Token",
            settingsKey: "github-token",
        }, _));

        page.add(buildPollingGroup(settings, {
            intervalKey: "refresh-interval",
            triggerKey: "refresh-trigger",
            rawResponseKey: "last-raw-response",
            provider: GitHubCopilotProvider,
        }, _));

        page.add(buildDebugGroup(settings, {
            rawResponseKey: "last-raw-response",
            apiDescription: _("Last response body received from the GitHub Copilot API"),
        }, _));

        return page;
    },
};
