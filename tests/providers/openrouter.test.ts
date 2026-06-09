import { describe, test, expect, mock, beforeAll } from "bun:test";
import type { IProviderType } from "../../providers/index";
import type { TestCase } from "./provider-util";
import { runTestCase } from "./provider-util";

mock.module("gi://Gio", () => ({
    default: { _promisify: () => {} },
}));

mock.module("gi://GLib", () => ({
    default: { PRIORITY_DEFAULT: 0 },
}));

let _mockHttpStatus = 200;

mock.module("gi://Soup?version=3.0", () => ({
    default: {
        Message: {
            new: () => ({
                get_request_headers: () => ({ append: () => {} }),
                get_status: () => _mockHttpStatus,
            }),
        },
        Status: { OK: 200 },
        Session: class {},
    },
}));

function mockSession(body: string, httpStatus = 200): any
{
    _mockHttpStatus = httpStatus;
    const enc = new TextEncoder();
    return {
        send_and_read_async: async () => ({ get_data: () => enc.encode(body) }),
    };
}

describe("OpenRouter provider", () =>
{
    let OpenRouterProvider: IProviderType;

    beforeAll(async () =>
    {
        const mod = await import("../../providers/openrouter");
        OpenRouterProvider = mod.OpenRouterProviderType;
    });

    const testCases: TestCase[] = [
        {
            name: "limit-based with partial usage",
            body: {
                data: {
                    label: "test-key",
                    limit: 100,
                    limit_remaining: 74.50,
                    usage: 100,
                    usage_daily: 5,
                    usage_weekly: 30,
                    usage_monthly: 25.50,
                    is_free_tier: false,
                },
            },
            wantPanelText: "25.50%",
            wantMetrics: [
                { label: "Monthly spend", value: "$25.50", spend: 25.50, percent: 25.5 },
                { label: "Daily spend", value: "$5.00", spend: 5 },
                { label: "Credits remaining", value: "$74.50", percent: 25.5 },
                { label: "Total spend", value: "$100.00", spend: 100 },
            ],
        },
        {
            name: "pay-as-you-go (no limit)",
            body: {
                data: {
                    label: "test-key",
                    limit: null,
                    limit_remaining: null,
                    usage: 150,
                    usage_daily: 10,
                    usage_weekly: 50,
                    usage_monthly: 42.75,
                    is_free_tier: false,
                },
            },
            wantPanelText: "$42.75",
            wantMetrics: [
                { label: "Monthly spend", value: "$42.75", spend: 42.75 },
                { label: "Daily spend", value: "$10.00", spend: 10 },
                { label: "Credits remaining", value: "N/A" },
                { label: "Total spend", value: "$150.00", spend: 150 },
            ],
        },
        {
            name: "free tier (zero usage)",
            body: {
                data: {
                    label: "test-key",
                    limit: null,
                    limit_remaining: null,
                    usage: 0,
                    usage_daily: 0,
                    usage_weekly: 0,
                    usage_monthly: 0,
                    is_free_tier: true,
                },
            },
            wantPanelText: "$0.00",
            wantMetrics: [
                { label: "Monthly spend", value: "$0.00", spend: 0 },
                { label: "Daily spend", value: "$0.00", spend: 0 },
                { label: "Credits remaining", value: "N/A" },
                { label: "Total spend", value: "$0.00", spend: 0 },
            ],
        },
        {
            name: "missing data",
            body: {},
            wantPanelText: "N/A",
            wantMetrics: [
                { label: "Monthly spend", value: "N/A" },
                { label: "Daily spend", value: "N/A" },
                { label: "Credits remaining", value: "N/A" },
                { label: "Total spend", value: "N/A" },
            ],
        },
        {
            name: "rejects on HTTP error",
            body: {},
            httpStatus: 401,
            wantError: true,
        },
        {
            name: "rejects on missing API key",
            body: {},
            apiKey: "",
            wantError: true,
            wantErrorMessage: "No OpenRouter API key configured",
        },
    ];

    for (const tc of testCases)
    {
        test(tc.name, () => runTestCase(tc, OpenRouterProvider.fetchStatus.bind(OpenRouterProvider), mockSession, "sk-or-xxx"));
    }
});
