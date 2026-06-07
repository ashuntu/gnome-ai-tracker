export type { IProviderType, ProviderInstance, ProviderMetric, ProviderStatus } from "./base.js";
export { loadInstances, saveInstances } from "./base.js";
export { GitHubCopilotProviderType } from "./github-copilot.js";
export { OpenRouterProviderType } from "./openrouter.js";

import type { IProviderType } from "./base.js";
import { GitHubCopilotProviderType } from "./github-copilot.js";
import { OpenRouterProviderType } from "./openrouter.js";

/** Ordered list of all registered provider types. */
export const PROVIDER_TYPES: IProviderType[] = [
    GitHubCopilotProviderType,
    OpenRouterProviderType,
];
