// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Configuration type definitions
 */

export type RuleType =
  | 'path'
  | 'subdomain'
  | 'domain'
  | 'method'
  | 'header'
  | 'parameter';

export interface Rule {
  description: string;
  type: RuleType;
  url_path: string;
}

export interface Rules {
  avoid?: Rule[];
  focus?: Rule[];
}

export type LoginType = 'form' | 'sso' | 'api' | 'basic';

export type SuccessConditionType = 'url' | 'cookie' | 'element' | 'redirect';

export interface SuccessCondition {
  type: SuccessConditionType;
  value: string;
}

export interface Credentials {
  username: string;
  password: string;
  totp_secret?: string;
}

export interface Authentication {
  login_type: LoginType;
  login_url: string;
  credentials: Credentials;
  login_flow: string[];
  success_condition: SuccessCondition;
}

/** Provider + model pair, parsed from "provider,model" strings */
export interface ModelSpec {
  provider: 'anthropic' | 'openai' | 'openrouter' | 'ollama';
  model: string;
}

/** Pipeline phases for model routing (parallel agents share the same phase) */
export type ModelPhase = 'pre-recon' | 'recon' | 'vulnerability' | 'exploitation' | 'report';

/** Per-phase model overrides with a default fallback */
export interface ModelRouting {
  default: ModelSpec;
  phases: Partial<Record<ModelPhase, ModelSpec>>;
}

/** Raw models section from YAML config (strings before parsing) */
export interface ModelsConfig {
  default?: string;
  phases?: Partial<Record<ModelPhase, string>>;
}

export interface Config {
  rules?: Rules;
  authentication?: Authentication;
  models?: ModelsConfig;
  login?: unknown; // Deprecated
}

export interface DistributedConfig {
  avoid: Rule[];
  focus: Rule[];
  authentication: Authentication | null;
  modelRouting: ModelRouting | null;
}
