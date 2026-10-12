/*
 * The node.k8s.io group's v1 types (generated) and how kubectl shows its
 * kinds (by hand: printers.go, v1.37.1 — printRuntimeClass).
 */

import type { RuntimeClass } from '../../gen/node/v1.js';
import { ageColumn, nameColumn, type PrinterColumn } from '../print.js';

export * from '../../gen/node/v1.js';

export const runtimeClassColumns: PrinterColumn<RuntimeClass>[] = [nameColumn, { name: 'Handler', type: 'string', value: (o) => o.handler, display: (o) => o.handler }, ageColumn];
