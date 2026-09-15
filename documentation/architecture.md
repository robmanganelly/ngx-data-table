# Architecture: patterns we take from Signal Store and Signal Forms

This document records **which ideas** we lift from NgRx Signal Store and Angular Signal Forms, and **how they help implement** the roadmap while obeying the two implementation directives.

It is not a public API spec. Names below are illustrative of the *shape* we want Angular developers to recognize.

## Directives this architecture must satisfy

1. **Emulate Signal Forms and Signal Store**, taking only the parts that fit a headless table. The public surface should feel native to Angular developers who already use `form()`, schemas, `signalStore()`, and `withX()` features.
2. **No single `createTable` catch-all.** Expose **factories for coordinators** that are already optimized for a use case (flat table vs grouped table vs expandable/tree table). Customize a coordinator with **features**, the same way a Signal Store is customized with `withState` / `withComputed` / custom `signalStoreFeature`s.

**Coordinator vs feature (from the directive):**

- Ask: *does every table, independent of use case, need this?*
- If yes → **feature** (pagination, column hiding, sorting, sizing, row selection).
- If no, and it changes the row topology or the pipeline itself → **coordinator** (expandable/tree table, grouped table).
- The line is slightly arbitrary on purpose. Prefer a new coordinator when a capability would otherwise sit unused and confusing on a simple table.

Factories exist to cut boilerplate and to **tree-shake**: importing `createGroupedTable` should not pull expand-from-children logic; importing `withPagination` should not pull grouping.

Call sites are a **positional list of features**, the same as `signalStore(withState(...), withMethods(...))` and `form(model, schema)`. Do not assemble a table with `{ data, columns, features: [...] }`.

## How the two libraries split responsibilities

| Concern | Signal Store | Signal Forms | What we take for tables |
| --- | --- | --- | --- |
| Composition | Sequential positional `withX(...)` args, reduced left to right | Positional `form(model, schema?, options?)`; schema rules are also positional calls (`required(path)`) | Coordinator factories take **positional features**, never a `{ features: [...] }` object |
| Source of truth | Store owns state slices | Host `WritableSignal` model; form does not copy it | Host owns **row data** via `withData(...)`; coordinator owns **interaction slices** unless the host links them |
| Public object | Flattened injectable: state signals + computed props + methods | `FieldTree`: call node for state, dot into children | Coordinator is a flat Signal-Store-like object; **rows/columns/cells** are a FieldTree-like graph |
| Derived values | `withComputed` | Signals on `FieldState` (`valid`, `disabled`, …) | Row models, header groups, “can sort”, page count, etc. |
| Updates | `patchState` (partial + updater fn, no unknown keys) | `value.set` writes through to the model | `patchState`-style updates for sort/page/selection; never mutate the data array |
| Lifecycle | `withHooks` + `DestroyRef` | Injection context + field manager effect | Create in an injection context; tear down with the host |
| Binding to DOM | None (you call methods) | `[formField]` two-way bind | Optional directives that bind headers/rows/cells to coordinator pieces |
| Reuse | `signalStoreFeature` bundles | `schema()` + `apply` / `applyEach` | Feature bundles (`withSorting`) and reusable column schemas |

We are **not** wrapping `@ngrx/signals` or `@angular/forms/signals` as a runtime dependency unless a later decision says otherwise. We copy **patterns**, implemented with `signal`, `computed`, `linkedSignal`, and `inject`.

---

## Patterns from NgRx Signal Store

Source of truth for this section: `signalStore` reduce loop, `InnerSignalStore`, `withState` / `withComputed` / `withMethods` / `withProps` / `withHooks`, `patchState`, `signalStoreFeature`, and `withEntities`.

### 1. A coordinator is positional composition, like `signalStore`

`signalStore(withState(...), withComputed(...), withMethods(...))` takes **features as positional arguments**. It does not take `{ state, methods, features }`. Internally it reduces left to right over an empty inner store. Each feature returns a richer store. The public object is a **flat merge** of members.

`form(model, schema?, options?)` is the same idea: overloads on **argument position**, not a config object. A feature’s own factory may take arguments (`withState({ count: 0 })`, `withColumns(userColumns)`); the **composer** stays a rest-parameter list.

**Use:** table factories are composers, not option bags.

```ts
// illustrative — matches signalStore / form, not a config object
const table = createFlatTable(
  withData(this.rows), // host-owned data signal
  withColumns(userColumns), // column tree, row value types
  withSorting(),
  withPagination(),
  withColumnVisibility(),
);
```

- `createFlatTable`, `createGroupedTable`, and `createExpandableTable` are the three composers. Each seeds a **topology brand** (see §2) so grouping cannot be attached to a flat table, and so on.
- Data and columns are features, not `createX({ data, columns })` fields. That keeps one composition story and lets the type checker require them (or reject two competing column sources).
- There is no `createTable({ grouping, expanding, everything })` and no `features: [...]` array.

A feature factory may still take **its** configuration as arguments (`withPagination(this.pageIndex)`, `withSorting({ initial: [...] })`), the same way `withState` takes an initial-state object. That object configures one feature; it is not how the table is assembled.

### 2. Features are `Input → Output` functions; overloads accumulate; conflicts are type errors

NgRx types a feature as:

`(store: InnerStore<Input>) => InnerStore<Output>`

`signalStore` is a stack of overloads. The second feature is typed as `SignalStoreFeature<{} & F1, F2>`: its **Input must already have been produced** by everything to its left. The result type is `F1 & F2 & …`. Members you never registered are not on the instance, so `nextPage` on a table without `withPagination()` is a compile error.

We use Signal Store Input/Output for **prerequisites** (this feature needs that slice). We use Angular `provideHttpClient` **feature kinds** for **exclusions** (these two features contradict each other).

**Prerequisite (must already be present):**

```ts
// illustrative
withSorting(): TableFeature<
  { columns: ColumnTree; rows: RowModel }, // Input
  { sorting: SortState; toggleSort: (...) => void } // Output added
>;

withGlobalFilter(): TableFeature<
  { columnFilters: FilterState }, // cannot attach unless column filtering is already composed
  { globalFilter: ... }
>;
```

If `withSorting()` is passed before `withColumns()` / `withData()`, `{} & F1` does not satisfy the Input and TypeScript errors on that argument — same as putting `withMethods` that reads `count` before `withState({ count })`.

**Exclusion (competing features, `provideHttpClient` pattern):**

Do not encode exclusions as “this feature’s Input forbids a state slot” (`columns?: never`). Angular does not do that for HTTP. It tags every feature with a **kind**, then the composer rejects known contradictory kinds.

From `packages/common/http/src/provider.ts`:

- `HttpFeatureKind` is an enum: one member per `withX()` (`CustomXsrfConfiguration`, `NoXsrfProtection`, `Fetch`, `Xhr`, `RequestsMadeViaParent`, …).
- `HttpFeature<Kind>` is `{ ɵkind: Kind; ɵproviders: Provider[] }`. Each factory returns a **branded** feature, e.g. `withNoXsrfProtection(): HttpFeature<HttpFeatureKind.NoXsrfProtection>`.
- `provideHttpClient(...features: HttpFeature<HttpFeatureKind>[])` takes positional rest args of that tagged union.
- In `ngDevMode`, kinds are collected into a `Set`. Named pairs throw: `NoXsrfProtection` + `CustomXsrfConfiguration`, and `RequestsMadeViaParent` + `Fetch`/`Xhr`.

`provideRouter` uses the same object shape (`RouterFeature<RouterFeatureKind>` with `ɵkind` / `ɵproviders`). The HTTP client is the one that **declares incompatible pairs**.

```ts
// Angular
provideHttpClient(withXsrfConfiguration({ cookieName: 'XSRF' }));
provideHttpClient(withNoXsrfProtection());
// both in one call → contradiction (dev-mode error)

// illustrative table equivalent
const enum TableFeatureKind {
  Columns,
  FixedColumns,
  Data,
  Sorting,
  ManualSorting,
  Pagination,
  // ...
}

interface TableFeature<Kind extends TableFeatureKind, TInput, TOutput> {
  ɵkind: Kind;
  // plus the Signal Store transform:
  (table: InnerTable<TInput>): InnerTable<TOutput>;
}

withColumns(defs): TableFeature<TableFeatureKind.Columns, Empty, { columns: ... }>;
withFixedColumns(defs): TableFeature<TableFeatureKind.FixedColumns, Empty, { columns: ... }>;
```

Incompatible kinds are a small table on the composer, the same way HTTP lists XSRF vs no-XSRF:

| Kind | Conflicts with |
| --- | --- |
| `Columns` | `FixedColumns`, a second `Columns` |
| `Data` | a second `Data` |
| `Sorting` | `ManualSorting` (if split for tree-shaking) |

Angular’s public `provideHttpClient` types the rest parameter as the **union** of kinds, so the editor will not always fail before runtime. We keep the same kind objects and **also** constrain the rest tuple so a second feature whose kind is already present, or is in the conflict table, is `never` — the error still sits on that argument.

```ts
createFlatTable(
  withColumns(userColumns),
  withFixedColumns(lockedColumns), // error: FixedColumns conflicts with Columns
);
```

**Dev vs production (same intent as `ngDevMode`):** type checking never ships. Extra runtime validation is for developers; production must not pay for `Set` walks or key intersections on every compose. Angular HTTP only runs its kind-conflict `Set` inside `if (ngDevMode)`. NgRx only runs unique-member checks inside `ngDevMode`. We do the same split, with one change: a collision **throws** in development instead of `console.warn`.

1. **Compile time — kinds.** Rest-argument overloads reject a duplicate `ɵkind` and reject pairs in the conflict table. This is the primary exclusion story. It disappears from the emitted JS.
2. **Compile time — Input / Output.** Keep Signal Store typing on the same feature object: `TableFeature<Kind, TInput, TOutput>`. The next argument must still be `TableFeature<..., {} & F1, F2>`. Prerequisites (sorting needs columns) stay type errors on that argument. Kinds and I/O compose: a feature is both a branded kind and a store transformer.
3. **Runtime reduce — cheap merge, guarded assert.** Production reduce is a spread, like Signal Store:

```ts
{
  ...prev,
  stateSignals: { ...prev.stateSignals, ...next.stateSignals },
  props: { ...prev.props, ...next.props },
  methods: { ...prev.methods, ...next.methods },
}
```

Wrap uniqueness in the Angular `ngDevMode` global (not `isDevMode()`), so the bundler constant-folds the block away in production:

```ts
if (typeof ngDevMode !== 'undefined' && ngDevMode) {
  assertUniqueFeatureKinds(features); // duplicate kind or conflict-table pair → throw
  assertUniqueStoreMembers(prev, next); // overlapping public keys → throw
}
```

`assertUniqueStoreMembers` is the NgRx check with **throw** instead of warn: name the colliding key and the two kinds. After a throw, composition stops; we never return a table whose fields silently shadow. In production the spread may overwrite if a bad combination somehow shipped — that is accepted, because it should have failed at compile time or in dev.

Do not run these asserts in production “to be safe.” That is the overhead `ngDevMode` exists to avoid. Do not skip them in dev in favor of a warning; a throw is the right developer signal.

**Topology** stays on the factory (`createFlatTable` vs `createGroupedTable`). Features that only belong on grouped tables declare Input `{ topology: 'grouped' }` (prerequisite). Features that cannot coexist on the *same* table declare conflicting kinds (exclusion).

**Use:**

- `withPagination()` adds page state, page count / can-go-next, navigation methods.
- `withSorting()` adds sort state, comparators, header helpers; Input requires columns + data.
- Independent features are preferred: visibility should not require pagination.
- Feature **prerequisites** from the roadmap (global filter → column filter; resize → sizing; aggregation → grouped topology) are Input types, not runtime duck-typing.

### 3. Separate state, derived props, methods, and hooks

Signal Store does not dump everything into one bag:

| Builder | Role | Table equivalent |
| --- | --- | --- |
| `withState` | Writable slices | sort list, page index, visibility map, selection ids |
| `withComputed` / `withProps` | Derived signals | filtered rows, header groups, selected count |
| `withMethods` | Commands | `nextPage()`, `toggleSort(column)`, `pinColumn(...)` |
| `withHooks` | `onInit` / `onDestroy` | subscribe to host data, reset page on filter, abort resize listeners |

**Use:** implement each roadmap capability as that quartet, then bundle it with a `signalStoreFeature`-style helper (`withPagination` = state + computed + methods + optional auto-reset hook).

Keep **row-model pipeline steps** as computed props, not methods. Methods change state; computeds derive the view.

### 4. `patchState`: slice updates, updater functions, no mystery keys

`patchState` reads a snapshot untracked, merges partials or updater functions, then `set`s only keys that were declared in initial state. Unknown keys warn in dev mode.

**Use:** all interaction state updates go through one patch helper. Sort, filters, and selection never grow ad-hoc properties at runtime. This matches the roadmap’s “controlled slice + updater” requirement.

Do **not** put the host’s row array on this patch surface. Data is not an interaction slice (see Signal Forms below).

### 5. One writable signal per slice, deep-read for nested objects

`withState({ pagination: { pageIndex, pageSize } })` stores a signal per **top-level key**, then wraps it in a deep-signal proxy so `store.pagination.pageIndex()` works without extra boilerplate.

**Use:** one signal per roadmap slice (sorting, columnFilters, pagination, rowSelection, columnVisibility, columnOrder, columnPinning, columnSizing, rowPinning, expanded, grouping, cellSelection). Nested reads can be deep signals or explicit computeds—prefer explicit computeds for hot paths (row lists) so we do not proxy tens of thousands of rows.

Do **not** deep-signal the row array. Rows are a derived view, like `withEntities`’ `entities` computed.

### 6. Entity adapter: ids + map + ordered list

`withEntities` stores `entityMap` and `ids`, and computes `entities` as `ids.map(id => map[id])`. Named collections prefix keys so two collections can coexist.

**Use for rows:**

- Core row model: `rowIds` + `rowsById` + computed `rows`.
- Flattened / paginated / selected views are extra computed lists over the same map.
- Stable identity (roadmap) is the entity id, not the array index.
- Selection, expansion, and pinning store **ids**, then materialize row objects only when the id exists in the current map (server paging caveat from the roadmap).

Named collections are useful when a grouped coordinator needs both “group rows” and “leaf rows” without colliding names.

### 7. Reusable feature bundles and collection prefixes

`signalStoreFeature(withState(...), withMethods(...))` is how `withCounter()` and `withEntities()` are built. Optional name prefixes avoid collisions.

**Use:** `withSorting()`, `withColumnFiltering()`, `withRowSelection()` are bundles. If a screen has two tables, the coordinator is instantiated twice—do not prefix by default. Prefixing is for **multiple collections inside one coordinator** (rare).

### 8. Lifecycle hooks chained, not replaced

`withHooks` **merges** `onInit` / `onDestroy` so several features can register teardown (resize document listeners, auto-reset page index, reset cell selection when data identity changes).

**Use:** `DestroyRef.onDestroy` from the injection context where the coordinator was created. Features must not leak listeners.

### 9. Protected state

Signal Store can hide the raw writable source so callers only use methods.

**Use:** default coordinators expose methods + readonly signals. Hosts that need URL/query ownership pass **linked inputs** (next section), not unconstrained patch access.

### 10. What we do **not** take from Signal Store

- Returning an `@Injectable` **class** as the primary API. Tables are created next to a component’s data signals, like `form(model)`, not like a root-provided store. A factory that returns an instance (optionally providable) is enough.
- `rxMethod` / Effects as the core. Data fetching stays in the host (roadmap: engine does not fetch).
- Store-to-store injection. One coordinator per table; a parent component orchestrates two tables if needed.

---

## Patterns from Angular Signal Forms

Source of truth for this section: `form(model, schema?, options?)`, `SchemaImpl` compile/cache, `FieldTree` proxy, `FieldNode` (structure + state + validation + submit), `linkedSignal` for control vs model, `[formField]`, `schema` / `apply` / `applyEach` / `applyWhen`, metadata keys, field adapter.

### 1. Host model is the source of truth; the engine does not copy it

`form(model)` wraps a `WritableSignal<T>`. Setting a field writes through to that signal. The form never keeps a forked copy of the model.

**Use for row data:**

- The host passes the row model through `withData(...)` (a signal or signal-like getter). That feature is positional, like `form(model)`.
- The coordinator **does not clone** records. Row wrappers hold a reference to `original`.
- Accessors compute displayed primitives into a cache; they do not write back into the record unless the host later opts into editing (out of scope).

This is the opposite of interaction state (Signal Store slices). Split is:

- **Model (forms pattern):** `data`, and optionally host-owned slices passed in as signals.
- **Ephemeral UI state (store pattern):** sort, page, selection, when the host did not pass them in.

### 2. Two layers: compile-time schema vs runtime tree

Signal Forms compile a schema **once** (non-reactive function binds rules to paths). Runtime `FieldNode`s evaluate those rules reactively. `schema()` caches compilation when reused via `apply`.

**Use:**

| Forms | Table |
| --- | --- |
| Schema path (`user.email`) | Column definition path (accessor / id / nested group) |
| Schema function (non-reactive setup) | Column factory / column helper (runs once per column list identity) |
| Runtime field node | Runtime column / header / row / cell objects |
| Rules: `required`, `disabled`, `hidden` | Rules: can-sort, can-hide, filter predicate, span predicate |

Column definitions are the **schema**. Changing the columns array identity rebuilds the column tree (roadmap: stable references). Do not re-parse column defs inside every `computed` for rows.

Reusable column packs (`schema()` + `apply`) map to reusable column groups: “identity columns”, “audit columns”, applied onto a table schema.

`applyEach` maps to “this logic applies to every row” (row-level selectability, expandability), not to columns.

`applyWhen` maps to conditional column logic (disable sort when the column is grouped; hide filter when data is loading)—structural registration, reactive activation.

### 3. FieldTree: call for state, navigate for children

A `FieldTree` is a function returning `FieldState`, **and** an object whose properties are child trees. The proxy lazily materializes children from the current value. Arrays expose `length` and iteration for `@for`.

**Use two trees:**

1. **Column tree** — group columns have child columns; leaves are accessor/display columns. Calling a column node yields column state (visible, pinned, size, canSort, filter value). Dotting into a group yields children. This is how header groups are walked.
2. **Row tree** — only on expandable and grouped coordinators. Parent rows have children; calling a row yields row state (selected, expanded, depth, cells).

A **flat table coordinator** still exposes `rows` as an array of row nodes, but those nodes have no child topology. That is why expandable/grouped are **different coordinators**: the row tree shape changes.

Cells are children of a row, keyed by column id, analogous to object subfields.

**Same state shape at every level** (forms: `valid()` exists on root and on `email`): `id`, parent, can-X flags, and feature-specific signals appear on column, row, and cell with the same naming so templates stay boring.

### 4. Lazy children + identity tracking + orphaning

Field nodes create children on demand. When the parent value’s identity changes, children can be reused by tracking key or orphaned (ignore updates).

**Use:**

- Do not allocate cell objects for every hidden column on every row up front if the row is not rendered (virtualizer). Allocate on read, cache by `rowId + columnId`.
- When data is replaced, reuse row nodes whose ids still exist; orphan the rest so selection listeners and expand state do not update dead rows.
- Header placeholders in uneven column trees are structural children, like missing nested fields.

### 5. `linkedSignal` for “follows source until the user writes”

Forms use `linkedSignal` so `controlValue` follows `value`, but typing updates the control immediately and flushes to the model after debounce. A second `linkedSignal` aborts in-flight debounce when the model changes from outside.

**Use everywhere the roadmap has internal vs controlled state:**

- `withPagination()` with no host signal: the feature owns page index/size.
- `withPagination(this.pageState)` (or an equivalent argument): the feature **links** to the host signal so URL/query/parent store stay the source of truth.
- Column resize: `onEnd` mode is control-value vs committed size (delta indicator during drag, commit on pointer up).
- Filter input debounce: control value in the text box, applied filter in table state.

This is also the Angular-native answer to TanStack’s “state + onStateChange” pair, without copying that API.

### 6. Directives bind UI to nodes (optional, tree-shakeable)

`[formField]` two-way binds an input to a field node and syncs disabled/readonly/required attributes. Focus walks bound controls in DOM order.

**Use optional directives** (separate entry points so headless users never import them):

- Sortable header: click cycles sort; sets `aria-sort` from column state.
- Resize handle: pointer events update sizing info / size.
- Row checkbox / row click: toggle selection; disabled when the row cannot be selected.
- Cell range: mousedown/mouseenter for spreadsheet selection.
- Expand button: `aria-expanded` from row state.

The engine stays headless: directives are convenience, like `[formField]`, not required markup. Hosts can call methods instead.

Do not invent a single `[dataTable]` structural directive that renders a full grid. That would violate headless posture.

### 7. Hidden / disabled / readonly as derived logic

Forms compute `hidden`, `disabled`, `readonly` from schema rules plus parent aggregation (a parent disabled disables children).

**Use:**

- Column hidden → omitted from header groups and from each row’s visible cells (roadmap visibility).
- Column cannot sort / filter / hide / pin / resize → disable the matching directive and omit from menus.
- Parent group hidden → children hidden.
- Disabled reasons (optional) help accessibility copy (“sorting unavailable while grouped”).

### 8. Metadata keys the engine does not interpret

Field metadata is a typed bag (min, max, pattern) plus user keys.

**Use:** column `meta` and table `meta` from the roadmap. Filter widget kind, alignment, detected type live here. The engine only documents conventions; UI libraries read them.

### 9. Adapter for custom controls

Forms’ `FieldAdapter` lets custom field implementations replace structure/state creation.

**Use later**, not in v1: custom row-model steps (host-supplied pipeline), custom cell identity for virtualizers. The hook exists so we do not paint ourselves into a sealed `FieldNode`.

### 10. Injection context at creation

`form()` `inject`s `Injector` (or takes a trailing options argument). `signalStore` allows an optional **leading** `{ providedIn }` object, then only features.

**Use:** coordinator factories run in an injection context (constructor / `inject()`). If we need an explicit injector, follow those libraries: optional first or last positional options, never `{ data, columns, injector, features }`.

### 11. What we do **not** take from Signal Forms

- Validation, submit, dirty/touched as table concepts. Tables are not forms. Touch/dirty might appear later for **editable cells**, which the roadmap marks out of scope.
- Writing through to row field values by default.
- Proxying the **data records** themselves as a FieldTree. We wrap rows; we do not make `table.rows[0].firstName` a form field unless we add editing.
- WebMCP / experimental tools.

---

## Mapping coordinators and features to the roadmap

### Coordinators (factories)

| Factory | Built-in topology | Roadmap slices it must include |
| --- | --- | --- |
| Flat table | One list of rows; column tree only | Lifecycle, data input (flat), column defs, headers/footers, core rows/cells, render resolution, state ownership, Angular adapter, a11y ids |
| Expandable / tree table | Row tree from child accessors or lazy children | Everything in flat, plus expanding, tree filtering depth, paginate-expanded-rows policy, parent/child selection rules |
| Grouped table | Synthetic group rows + leaf children; grouped column reorder/remove | Everything in flat, plus grouping; aggregation as a **feature** that only types onto this coordinator |

A grouped+expandable table is positional composition on the grouped factory:

```ts
createGroupedTable(
  withColumns(userColumns),
  withData(this.rows),
  withExpanding(),
);
```

or a fourth factory if that combination is the common case. Prefer `withExpanding()` on the grouped coordinator when expanding is optional there; keep `createExpandableTable` for hierarchical **source** data without grouping. `withExpanding()` types its Input as tree-or-grouped topology so it does not attach to a flat table.

Cell spanning and cell selection stay **features** on any coordinator: they do not change row topology, only how cells render and what “selected” means.

### Features (`withX`) and the store quartet

Each feature should declare: Input (required slots + topology, or `never` slots it exclusively claims), Output (state, computeds, methods), hooks, and runtime implementation. The factory overloads enforce Input against the features already passed.

| Feature | State | Derived | Commands | Notes |
| --- | --- | --- | --- | --- |
| Sorting | ordered column+direction list | sorted rows, per-column sort status | toggle / clear / set | Pipeline step; `manual` skips compute |
| Column filtering | per-column values | filtered rows, is-filtered | set/reset | Tree-filter options only on expandable/grouped |
| Global filtering | one value | same pipeline | set/reset | Input type: requires column filtering |
| Faceting | none (or cache) | unique values, min/max | — | Computed from pre-filter rows |
| Pagination | index + size | page rows, counts, can-next | nav + page size | Auto-reset hook |
| Row selection | id set | selected rows, all/some/indeterminate | toggle row/page/all | Entity ids |
| Column visibility | id → boolean | visible leaves, header groups | toggle / show all | Header groups already visibility-aware |
| Column ordering | id list | ordered leaves | set / reset | Unpinned only if pinning present |
| Column pinning | start/end id lists | left/center/right columns & cells | pin / unpin | Applied before order |
| Column sizing | id → size | sizes, total width | set size | |
| Column resizing | drag info | delta, is-resizing | pointer handlers | Needs sizing; `linkedSignal` for onEnd |
| Row pinning | top/bottom ids | top/center/bottom row lists | pin / unpin | Before sort in row order |
| Cell spanning | none | span index, per-cell spans | — | Stateless; skip zero-span cells |
| Cell selection | range list | bounds, focused cell, edges | select/move/extend | Merge-aware if spanning present |
| Aggregation | none extra | aggregate values on group rows | — | Grouped coordinator only |

Client vs server: prefer **two features** when the algorithms should tree-shake apart (`withClientSorting()` vs `withManualSorting()`), with a shared exclusive `sorting` slot so they cannot both be passed. If that is too noisy, one feature with a positional/argument option is acceptable; do not put `manualSorting` on the coordinator factory object.

`withColumns` / `withData` are features in the same list as sorting. They are not special config keys. Variants that cannot coexist (static defs vs fixed layout vs fully dynamic generated columns) are **different kinds** that the composer treats as contradictory, the same way `withXsrfConfiguration` and `withNoXsrfProtection` cannot share one `provideHttpClient()` call.

### Pipeline as computed stages (store `withComputed`, not a mutable array)

Order from the roadmap, only for enabled steps:

`core → filter → group → sort → expand → page → render rows`

Each stage is a named computed. The public `rows` signal is the last enabled stage. Pre-stage views (`rowsBeforePage`, …) are extra computeds for “N of M” and export. Manual flags skip a stage by aliasing the previous computed.

Grouped coordinator inserts the group stage even if the host has not grouped yet (identity transform). Flat coordinator must not import grouping code.

### Column helper ≈ typed schema builder

Signal Forms’ path object is typed from `TModel`. A column helper typed from the row type (and from enabled features) is the analog: accessor columns infer value types for sort/filter. Dynamic rows use `Record<string, unknown>` and lose inference—same tradeoff as forms with unknown models.

### Render resolution ≈ control adapter, not `flexRender`

Forms resolve a field to a bound control. We resolve header/cell/footer content that may be a string, a function, or an `NgTemplate`. Keep this a small `withRendering()` that every coordinator prepends internally, or that callers never see. Directives are optional; this helper is core. It is not passed as `{ render }` on a config object.

---

## Angular consumption shape

This is the hybrid that satisfies both directives and the roadmap’s “signals, `@for`, inject”:

```ts
// illustrative — not the final public API
readonly rows = signal<User[]>([]);

readonly table = createFlatTable(
  withColumns(userColumns),
  withData(this.rows),
  withSorting(),
  withPagination({ pageSize: 25 }),
  withRowSelection(),
);

// templates
// @for (headerGroup of table.headerGroups(); track headerGroup.id)
// @for (row of table.rows(); track row.id)
// @for (cell of row.visibleCells(); track cell.id)
```

- `withColumns` / `withData` are features. Arguments they need (defs, the data signal) are **their** positional/argument lists, matching `withState({ count: 0 })` and `form(model)`.
- `withPagination({ pageSize: 25 })` may take an argument object for *that feature*. The coordinator factory does not.
- `table.sort()` / `table.pagination()` are slice signals (store).
- `table.rows()` is a computed view (store `withComputed`).
- `row.cells.email` or `row.cell('email')` is tree navigation (forms). Prefer an explicit `cell(id)` if proxies hurt debugging; a proxy is acceptable if it matches FieldTree ergonomics and we document it.
- Host-owned paging: `withPagination(this.pageState)` (or a linked argument on that feature), not `createFlatTable({ pagination })`.

Illegal combinations should fail in the editor, for example `withColumns(...)` then `withFixedColumns(...)`, or `withAggregation()` on `createFlatTable`.

Instance lifetime: created in the component field initializer or constructor; destroyed with the component. Providing the coordinator in `providers` is optional for child cell components that want `inject(TableRef)`—that **is** a Signal Store pattern, used sparingly.

## Tree-shaking rules

1. Coordinator files import only the pipeline stages they need.
2. Each `withX` lives in its own entry path (`ngx-data-table/pagination`).
3. Directives are a separate entry (`ngx-data-table/sort-header`).
4. Built-in sort/filter/aggregate **functions** are individually imported (roadmap registries), not a barrel of every comparator.
5. Type-only feature slots must not pull runtime code; use `import type` and separate runtime feature objects.

## Implementation order (aligned with roadmap, expressed as this architecture)

1. Inner coordinator + positional feature reduce + `withState`/`withComputed`/`withMethods`/`withHooks` primitives + `patchState` + Input/Output overloads + `TableFeatureKind` tagged features (`provideHttpClient` exclusions).
2. Flat coordinator: `withColumns`, `withData`, header groups, core row/cell nodes, render resolver.
3. Linked/controlled slices.
4. Features: visibility, order, pin, size, resize.
5. Features: sort, filter, global filter, facet, pagination (exclusive client vs manual features, or one feature with its own argument).
6. Expandable coordinator + row-selection + row-pin features.
7. Grouped coordinator + aggregation feature.
8. Cell spanning, then cell selection.
9. Optional bind directives and a11y attributes.
10. Dynamic columns and metadata.

Each step should land as a demo that uses signals and `@for` only—no CSS grid framework required.
