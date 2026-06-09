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

describe("GitHub Copilot provider", () =>
{
    let CopilotProvider: IProviderType;

    beforeAll(async () =>
    {
        const mod = await import("../../providers/github-copilot");
        CopilotProvider = mod.GitHubCopilotProviderType;
    });

    const testCases: TestCase[] = [
        {
            name: "limited quota with partial usage",
            body: {
                quota_snapshots: {
                    premium_interactions: {
                        entitlement: 100, remaining: 70, quota_remaining: 70,
                        unlimited: false, has_quota: true, overage_count: 0,
                        overage_permitted: false, percent_remaining: 70,
                        quota_id: "premium", quota_reset_at: 0, timestamp_utc: "",
                        token_based_billing: false,
                    },
                    chat: {
                        entitlement: 50, remaining: 25, quota_remaining: 25,
                        unlimited: false, has_quota: true, overage_count: 0,
                        overage_permitted: false, percent_remaining: 50,
                        quota_id: "chat", quota_reset_at: 0, timestamp_utc: "",
                        token_based_billing: false,
                    },
                    completions: {
                        entitlement: 200, remaining: 200, quota_remaining: 200,
                        unlimited: false, has_quota: true, overage_count: 0,
                        overage_permitted: false, percent_remaining: 100,
                        quota_id: "completions", quota_reset_at: 0, timestamp_utc: "",
                        token_based_billing: false,
                    },
                },
            },
            wantPanelText: "30%",
            wantMetrics: [
                { label: "Premium", value: "N/A", spend: 0.3, percent: 30 },
                { label: "Chat", value: "N/A", spend: 0.25, percent: 50 },
                { label: "Completions", value: "N/A", spend: 0, percent: 0 },
            ],
        },
        {
            name: "unlimited quota",
            body: {
                quota_snapshots: {
                    premium_interactions: {
                        entitlement: 0, remaining: 0, quota_remaining: 0,
                        unlimited: true, has_quota: true, overage_count: 0,
                        overage_permitted: false, percent_remaining: 100,
                        quota_id: "premium", quota_reset_at: 0, timestamp_utc: "",
                        token_based_billing: false,
                    },
                    chat: {
                        entitlement: 0, remaining: 0, quota_remaining: 0,
                        unlimited: true, has_quota: true, overage_count: 0,
                        overage_permitted: false, percent_remaining: 100,
                        quota_id: "chat", quota_reset_at: 0, timestamp_utc: "",
                        token_based_billing: false,
                    },
                    completions: {
                        entitlement: 0, remaining: 0, quota_remaining: 0,
                        unlimited: true, has_quota: true, overage_count: 0,
                        overage_permitted: false, percent_remaining: 100,
                        quota_id: "completions", quota_reset_at: 0, timestamp_utc: "",
                        token_based_billing: false,
                    },
                },
            },
            wantPanelText: "\u221E",
            wantMetrics: [
                { label: "Premium", value: "\u221E" },
                { label: "Chat", value: "\u221E" },
                { label: "Completions", value: "\u221E" },
            ],
        },
        {
            name: "missing quota_snapshots",
            body: {},
            wantPanelText: "N/A",
            wantMetrics: [
                { label: "Premium", value: "N/A" },
                { label: "Chat", value: "N/A" },
                { label: "Completions", value: "N/A" },
            ],
        },
        {
            name: "null quota_snapshots",
            body: { quota_snapshots: null },
            wantPanelText: "N/A",
            wantMetrics: [
                { label: "Premium", value: "N/A" },
                { label: "Chat", value: "N/A" },
                { label: "Completions", value: "N/A" },
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
            wantErrorMessage: "No GitHub token configured",
        },
    ];

    for (const tc of testCases)
    {
        test(tc.name, () => runTestCase(tc, CopilotProvider.fetchStatus.bind(CopilotProvider), mockSession, "test-token"));
    }
});
