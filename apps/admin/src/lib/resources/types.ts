export type FieldType =
  | 'text' | 'textarea' | 'markdown' | 'number' | 'money' | 'percent' | 'bool' | 'select' | 'date' | 'datetime'
  | 'tags' | 'lines' | 'image' | 'multi' | 'uuids';

export interface OptionSource {
  table: string;
  value: string;
  label: string;
  /** Optional equality filter, e.g. { is_active: true }. */
  where?: Record<string, string | boolean>;
  orderBy?: string;
}

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  /** For `select`: fixed options or a table to load from. */
  options?: { value: string; label: string }[];
  from?: OptionSource;
  /** For `image`: storage bucket the upload goes to. */
  bucket?: string;
  min?: number;
  max?: number;
  /** Column differs from field name (e.g. money field `price` writes `price_kobo`). */
  column?: string;
  /** Allow an empty selection (stored as null). */
  nullable?: boolean;
  /** Auto-generate from another field when left blank (slugs). */
  slugFrom?: string;
  /** Only meaningful on create (e.g. a code that must not change). */
  createOnly?: boolean;
  rows?: number;
  uppercase?: boolean;
}

export interface JoinDef {
  /** Join table, e.g. service_branches. */
  table: string;
  /** Column pointing at this resource's row. */
  fk: string;
  /** Column pointing at the other side. */
  other: string;
  /** Form field name for the checkbox group. */
  name: string;
  label: string;
  from: OptionSource;
}

export interface ColumnDef {
  header: string;
  key: string;
  format?: 'text' | 'bool' | 'money' | 'date' | 'datetime' | 'badge' | 'count';
  /** Dot path into an embedded relation, e.g. service_categories.name */
  path?: string;
}

export interface ResourceDef {
  slug: string;
  title: string;
  singular: string;
  description: string;
  table: string;
  pk?: string;
  /** Permission needed to see the list. */
  view: string;
  /** Permission needed to create / edit / delete. */
  write: string;
  /** `select` string for the list/detail query (embedded relations). */
  select?: string;
  columns: ColumnDef[];
  fields: FieldDef[];
  joins?: JoinDef[];
  searchColumns: string[];
  orderBy: string;
  ascending?: boolean;
  allowCreate?: boolean;
  deletable?: boolean;
  /** Names of boolean columns that "deactivate" instead of delete (shown in the list as status). */
  statusColumn?: string;
}
