import type { Condition } from '@overkube/sdk';

/*
 * Whether a condition holds: true, false — or undefined while what it tests
 * is not known yet (discovery has not answered). No condition holds.
 */

export interface Facts {
  served(groupOrKind: string): boolean | undefined;
  available(apiService: string): boolean | undefined;
  service(name: string): boolean;
}

export function holds(condition: Condition | undefined, facts: Facts): boolean | undefined {
  if (!condition) return true;
  const parts: (boolean | undefined)[] = [];
  if (condition.served !== undefined) parts.push(facts.served(condition.served));
  if (condition.available !== undefined) parts.push(facts.available(condition.available));
  if (condition.service !== undefined) parts.push(facts.service(condition.service));
  if (parts.includes(false)) return false;
  return parts.includes(undefined) ? undefined : true;
}
