// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import type { AgentName } from '../types/agents.js';
import type { ModelSpec, ModelPhase, ModelRouting } from '../types/config.js';

/**
 * Get the actual model name being used.
 * When using claude-code-router, the SDK reports its configured model (claude-sonnet)
 * but the actual model is determined by ROUTER_DEFAULT env var.
 */
export function getActualModelName(sdkReportedModel?: string): string | undefined {
  const routerBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const routerDefault = process.env.ROUTER_DEFAULT;

  // If router mode is active and ROUTER_DEFAULT is set, use that
  if (routerBaseUrl && routerDefault) {
    // ROUTER_DEFAULT format: "provider,model" (e.g., "gemini,gemini-2.5-pro")
    const parts = routerDefault.split(',');
    if (parts.length >= 2) {
      return parts.slice(1).join(','); // Handle model names with commas
    }
  }

  // Fall back to SDK-reported model
  return sdkReportedModel;
}

/**
 * Check if router mode is active.
 */
export function isRouterMode(): boolean {
  return !!process.env.ANTHROPIC_BASE_URL && !!process.env.ROUTER_DEFAULT;
}

/** Maps each agent name to its pipeline phase for model routing */
const AGENT_TO_PHASE: Record<AgentName, ModelPhase> = {
  'pre-recon':         'pre-recon',
  'recon':             'recon',
  'injection-vuln':    'vulnerability',
  'xss-vuln':          'vulnerability',
  'auth-vuln':         'vulnerability',
  'ssrf-vuln':         'vulnerability',
  'authz-vuln':        'vulnerability',
  'injection-exploit': 'exploitation',
  'xss-exploit':       'exploitation',
  'auth-exploit':      'exploitation',
  'ssrf-exploit':      'exploitation',
  'authz-exploit':     'exploitation',
  'report':            'report',
};

/** Env var names for per-phase model overrides */
const PHASE_ENV_VARS: Record<ModelPhase, string> = {
  'pre-recon':     'MODEL_PRE_RECON',
  'recon':         'MODEL_RECON',
  'vulnerability': 'MODEL_VULNERABILITY',
  'exploitation':  'MODEL_EXPLOITATION',
  'report':        'MODEL_REPORT',
};

const ANTHROPIC_DEFAULT: ModelSpec = { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929' };

/**
 * Parse a "provider,model" string into a ModelSpec.
 * Returns null if the string is empty or malformed.
 */
export function parseModelSpec(spec: string): ModelSpec | null {
  if (!spec || !spec.includes(',')) return null;
  const commaIdx = spec.indexOf(',');
  const provider = spec.slice(0, commaIdx).trim().toLowerCase();
  const model = spec.slice(commaIdx + 1).trim();
  if (!provider || !model) return null;
  if (!['anthropic', 'openai', 'openrouter', 'ollama'].includes(provider)) return null;
  return { provider: provider as ModelSpec['provider'], model };
}

/**
 * Resolve which model to use for a given agent.
 * Priority: phase override > default > anthropic fallback
 */
export function resolveModelForAgent(
  agentName: AgentName,
  routing: ModelRouting | null
): ModelSpec {
  if (!routing) return ANTHROPIC_DEFAULT;
  const phase = AGENT_TO_PHASE[agentName];
  return routing.phases[phase] ?? routing.default;
}

/**
 * Set process.env to route SDK requests to the correct provider.
 * Returns a cleanup function that restores original env vars.
 */
export function activateProvider(spec: ModelSpec): () => void {
  const saved = {
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
    ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
    ROUTER_DEFAULT: process.env.ROUTER_DEFAULT,
  };

  if (spec.provider === 'anthropic') {
    // Direct Anthropic — clear router vars so SDK talks directly
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ROUTER_DEFAULT;
  } else {
    // Routed provider — point SDK at router
    // ANTHROPIC_BASE_URL should already be set to the router address
    // We just need to set ROUTER_DEFAULT to tell the router which provider/model
    process.env.ROUTER_DEFAULT = `${spec.provider},${spec.model}`;
  }

  return () => {
    // Restore original values
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  };
}

/**
 * Build ModelRouting from environment variables.
 * Reads ROUTER_DEFAULT for the default model and MODEL_* vars for phase overrides.
 * Returns null if no model routing is configured (pure Anthropic mode).
 */
export function buildModelRoutingFromEnv(): ModelRouting | null {
  const routerDefault = process.env.ROUTER_DEFAULT;
  const defaultSpec = routerDefault ? parseModelSpec(routerDefault) : null;

  const phases: Partial<Record<ModelPhase, ModelSpec>> = {};
  let hasPhaseOverrides = false;

  for (const [phase, envVar] of Object.entries(PHASE_ENV_VARS)) {
    const val = process.env[envVar];
    if (val) {
      const spec = parseModelSpec(val);
      if (spec) {
        phases[phase as ModelPhase] = spec;
        hasPhaseOverrides = true;
      }
    }
  }

  // No routing configured at all
  if (!defaultSpec && !hasPhaseOverrides) return null;

  return {
    default: defaultSpec ?? ANTHROPIC_DEFAULT,
    phases,
  };
}

/**
 * Warn if parallel phases (vulnerability, exploitation) have inconsistent providers.
 * Parallel agents share process.env so they must use the same provider.
 * If a phase override differs from default for a parallel phase, log a warning.
 */
export function validateParallelPhaseConsistency(routing: ModelRouting): void {
  const parallelPhases: ModelPhase[] = ['vulnerability', 'exploitation'];
  for (const phase of parallelPhases) {
    const override = routing.phases[phase];
    if (override && override.provider !== routing.default.provider) {
      console.warn(
        `⚠️  Phase "${phase}" uses provider "${override.provider}" but default is "${routing.default.provider}". ` +
        `All 5 parallel ${phase} agents will use "${override.provider}" — ensure this is intended.`
      );
    }
  }
}
