// Phase 45 — sessions.searchAll MCP tool (MEM-03).

import { searchAllProjects, type CrossSearchHit } from '@cds/core';
import { performance } from 'node:perf_hooks';

import { InvalidFilterError } from './shared.js';

export interface SearchAllArgs {
  query: string;
  limit?: number;
}

export interface SearchAllResult {
  hits: CrossSearchHit[];
  total_matched: number;
  query_time_ms: number;
}

function clampLimit(n: number | undefined): number {
  const raw = typeof n === 'number' && Number.isFinite(n) ? n : 20;
  return Math.min(Math.max(1, Math.floor(raw)), 100);
}

export async function sessionsSearchAll(
  args: SearchAllArgs,
): Promise<SearchAllResult> {
  if (typeof args.query !== 'string' || args.query.trim().length === 0) {
    throw new InvalidFilterError('query must be a non-empty string');
  }

  const limit = clampLimit(args.limit);
  const started = performance.now();
  const hits = searchAllProjects(args.query, { limit });
  const query_time_ms =
    Math.round((performance.now() - started) * 1000) / 1000;

  return {
    hits,
    total_matched: hits.length,
    query_time_ms,
  };
}
