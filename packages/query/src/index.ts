/*
 * @overkube/query: what overkube asks of a cluster's data, as data — fields
 * (a path, or worked out of an object alone), queries (get one, list a
 * window, count by a field; a log's window), their results (live while
 * read) — and kubectl's JSONPath; a query answered by a scan of the
 * objects given, a log's window picked out of its lines. Pure: the
 * page answers them from what it watches, a server could from its indexes,
 * and nothing that asks has to know which.
 */

export { type CompileCel, checkFieldDef, defineField, FIELD_LIMITS, fieldsOf, fieldVersion } from './def.ts';
export { canonical, fnv1a, fnv1a64 } from './hash.ts';
export { cursorOf, entriesBefore, entriesOf, type LogEntry, logTimeKey, logWindow, readCursor } from './logs.ts';
export type {
  Bounds,
  Capabilities,
  CountQuery,
  CountResult,
  Cursor,
  FieldCatalog,
  FieldDef,
  FieldError,
  FieldName,
  FieldSpec,
  FieldsResult,
  FieldType,
  GetQuery,
  GetResult,
  Group,
  Item,
  KindColumn,
  KindRef,
  ListQuery,
  ListResult,
  Live,
  LogCursor,
  LogLine,
  LogQuery,
  LogResult,
  Op,
  Page,
  Path,
  Query,
  QueryError,
  Result,
  Scope,
  SearchGroup,
  SearchItem,
  SearchQuery,
  SearchResult,
  SizeResult,
  Sort,
  Source,
  State,
  Test,
  Total,
  Unit,
  Value,
  Where,
} from './model.ts';
export { compilePath, isPath, PathError, PathEvalError, valuesAt } from './path.ts';
export {
  checkQuery,
  compare,
  type Fields,
  keyOf,
  kindRef,
  LIMITS,
  matches,
  type Ordered,
  ordered,
  predicateOf,
  scan,
  scanCount,
  valuesOf,
  valuesReader,
  windowOf,
} from './scan.ts';
export {
  holdsTo,
  kindOfRef,
  type LabelSelector,
  type Loose,
  lowerAscii,
  parseLoose,
  parseSelector,
  type Requirement,
  rankOf,
  requirementsOf,
  wordsOf,
} from './selector.ts';
export { byCodePoint } from './text.ts';
