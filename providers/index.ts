export type { IProvider, ProviderMetric, ProviderStatus } from "./base.js";
export { GitHubCopilotProvider } from "./github-copilot.js";
export { OpenRouterProvider } from "./openrouter.js";

import type { IProvider } from "./base.js";
import { GitHubCopilotProvider } from "./github-copilot.js";
import { OpenRouterProvider } from "./openrouter.js";

/** Ordered list of all registered providers. */
export const PROVIDERS: IProvider[] = [
    GitHubCopilotProvider,
    OpenRouterProvider,
];
