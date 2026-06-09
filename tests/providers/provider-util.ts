import { expect } from "bun:test";
import type { ProviderMetric } from "../../providers/base";

export interface TestCase {
    name: string;
    body: Record<string, unknown>;
    httpStatus?: number;
    apiKey?: string;
    wantPanelText?: string;
    wantMetrics?: Partial<ProviderMetric>[];
    wantError?: boolean;
    wantErrorMessage?: string;
}

export async function runTestCase(
    tc: TestCase,
    fetchStatus: (session: any, instance: any) => Promise<any>,
    mockSession: (body: string, httpStatus?: number) => any,
    defaultApiKey: string,
): Promise<void> {
    const instance = { apiKey: tc.apiKey ?? defaultApiKey, name: "test", enabled: true, rawResponse: "" };
    const session = mockSession(JSON.stringify(tc.body), tc.httpStatus ?? 200);

    if (tc.wantError) {
        const promise = fetchStatus(session, instance);
        if (tc.wantErrorMessage) {
            expect(promise).rejects.toThrow(tc.wantErrorMessage);
        } else {
            expect(promise).rejects.toThrow();
        }
        return;
    }

    const status = await fetchStatus(session, instance);
    expect(status.panelText).toBe(tc.wantPanelText);
    if (tc.wantMetrics) {
        expect(status.metrics).toHaveLength(tc.wantMetrics.length);
        for (let i = 0; i < tc.wantMetrics.length; i++) {
            expect(status.metrics[i]).toMatchObject(tc.wantMetrics[i]);
        }
    }
    expect(status.rawResponse).toBe(JSON.stringify(tc.body));
}
