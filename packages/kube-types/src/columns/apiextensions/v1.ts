/*
 * The apiextensions.k8s.io group's v1 types (generated) and how kubectl
 * shows its kinds (by hand: the API server's default table — Name, Created
 * At).
 */

import type { CustomResourceDefinition } from '../../gen/apiextensions/v1.js';
import { defaultColumns, type PrinterColumn } from '../print.js';

export * from '../../gen/apiextensions/v1.js';

export const customResourceDefinitionColumns: PrinterColumn<CustomResourceDefinition>[] = defaultColumns;
