import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup?version=3.0";

Gio._promisify(Soup.Session.prototype, "send_and_read_async", "send_and_read_finish");

import type { IProviderType, ProviderInstance, ProviderMetric, ProviderStatus } from "./base.js";

const API_URL = "https://openrouter.ai/api/v1/key";

interface OpenRouterKeyData
{
    label: string;
    limit: number | null;
    limit_remaining: number | null;
    usage: number;
    usage_daily: number;
    usage_weekly: number;
    usage_monthly: number;
    is_free_tier: boolean;
}

interface OpenRouterKeyResponse
{
    data?: OpenRouterKeyData;
}

type MetricKey = "usage_monthly" | "usage_daily" | "limit_remaining" | "usage";

const METRIC_LABELS: Record<MetricKey, string> = {
    usage_monthly: "Monthly spend",
    usage_daily: "Daily spend",
    limit_remaining: "Credits remaining",
    usage: "Total spend",
};

const METRIC_KEYS: MetricKey[] = ["usage_monthly", "usage_daily", "limit_remaining", "usage"];

function _formatCredits(value: number | null | undefined, label: string): string
{
    if (value === null || value === undefined)
    {
        return `${label}: N/A`;
    }
    return `${label}: $${value.toFixed(2)}`;
}

function _formatPanelText(data: OpenRouterKeyData | undefined): string
{
    if (!data)
    {
        return "N/A";
    }
    if (data.limit !== null && data.limit !== undefined && data.limit > 0)
    {
        const pct = (data.usage_monthly / data.limit) * 100;
        return `${pct.toFixed(2)}%`;
    }
    return `$${data.usage_monthly.toFixed(2)}`;
}

export const OpenRouterProviderType: IProviderType = {
    id: "openrouter",
    displayName: "OpenRouter",
    description: "Credit usage across all models",
    iconName: "network-transmit-receive-symbolic",
    iconPath: "icons/openrouter-symbolic.svg",
    metricLabels: METRIC_KEYS.map(k => METRIC_LABELS[k]),

    async fetchStatus(
        session: InstanceType<typeof Soup.Session>,
        instance: ProviderInstance,
    ): Promise<ProviderStatus>
    {
        const apiKey = instance.apiKey;
        if (!apiKey)
        {
            throw new Error("No OpenRouter API key configured");
        }

        const message = Soup.Message.new("GET", API_URL);
        if (!message)
        {
            throw new Error(`Failed to construct Soup.Message for ${API_URL}`);
        }

        const headers = message.get_request_headers();
        headers.append("Authorization", `Bearer ${apiKey}`);
        headers.append("User-Agent", "gnome-ai-tracker/1.0");

        const bytes = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);

        const status = message.get_status();
        if (status !== Soup.Status.OK)
        {
            throw new Error(`OpenRouter API returned HTTP ${status}`);
        }

        const decoder = new TextDecoder("utf-8");
        const raw = decoder.decode(bytes.get_data() ?? new Uint8Array());
        const response = JSON.parse(raw) as OpenRouterKeyResponse;

        const data = response?.data;
        const panelText = _formatPanelText(data);

        const metrics: ProviderMetric[] = [
            {
                label: METRIC_LABELS.usage_monthly,
                value: _formatCredits(data?.usage_monthly, METRIC_LABELS.usage_monthly),
                spend: data?.usage_monthly ?? undefined,
                percent: (data?.limit !== null && data?.limit !== undefined && data.limit > 0)
                    ? parseFloat(((data.usage_monthly / data.limit) * 100).toFixed(2))
                    : undefined,
            },
            {
                label: METRIC_LABELS.usage_daily,
                value: _formatCredits(data?.usage_daily, METRIC_LABELS.usage_daily),
                spend: data?.usage_daily ?? undefined,
            },
            {
                label: METRIC_LABELS.limit_remaining,
                value: _formatCredits(data?.limit_remaining, METRIC_LABELS.limit_remaining),
                percent: (data?.limit !== null && data?.limit !== undefined && data.limit > 0 && data.limit_remaining !== null && data.limit_remaining !== undefined)
                    ? parseFloat((((data.limit - data.limit_remaining) / data.limit) * 100).toFixed(2))
                    : undefined,
            },
            {
                label: METRIC_LABELS.usage,
                value: _formatCredits(data?.usage, METRIC_LABELS.usage),
                spend: data?.usage ?? undefined,
            },
        ];

        return { panelText, metrics, rawResponse: raw };
    },
};
