#!/usr/bin/env tsx
/**
 * Prints the canonical critical-route list (one per line) to stdout.
 * Consumed by launch.sh — keeps the bash smoke check in lock-step with
 * the TypeScript E2E source of truth.
 */
import { CRITICAL_ROUTE_PATHS } from '../apps/web/src/lib/critical-routes.js';

for (const path of CRITICAL_ROUTE_PATHS) {
  console.log(path);
}
