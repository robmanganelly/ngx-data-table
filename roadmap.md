# Feature roadmap: headless table parity

This document lists the functional capabilities this library must provide to match TanStack Table for Angular, which is our target library.
It describes expected behavior for consumers who own markup and styling.
It does not prescribe method names, option names, or a copied API surface.

Capabilities are grouped so each heading is a shippable slice. Nested bullets are smaller units of work.

## Product posture

- Headless table engine: the library owns data modeling, derived views, and interactive state. The application owns HTML, CSS, and visual components.
- Angular-native consumption: table state and derived views are reactive in a way that works with signals, templates, and change detection without forcing a foreign store into the app.
- Opt-in capabilities: a table that only displays rows should not pay for sorting, filtering, grouping, or selection. Unused capabilities should be tree-shakable.
- Non-mutating data: the original row array is never mutated. Derived rows, cells, and values are computed views.
- Client or server processing: each data-transforming capability can either run in the browser or only track UI state while the host application (or a backend) supplies already-processed rows.
- Feature composition: capabilities combine. Filtering, grouping, sorting, expanding, and paging form one pipeline. Pinning, visibility, and order affect which columns and rows the UI iterates.
- No bundled virtualization: scrolling large lists with windowing is an integration concern with a virtualizer, not a table-engine feature. The engine should expose stable row/column identities and sizes so a virtualizer can attach.

## Table lifecycle

- Creating a table: given columns, rows of data, and an explicit set of enabled capabilities, produce a table coordinator the UI can read and update.
- Stable inputs: column definitions and the data array should keep stable identity when their contents have not changed, so derived models are not rebuilt on every change-detection cycle.
- Updating options after creation: the host can change data, columns, and configuration over time without reconstructing the entire public surface.
- Destroying a table: subscriptions and derived work stop when the host tears the table down.
- Default column settings: table-wide defaults (size, enablement flags, formatters) apply to every column and can be overridden per column.
- Arbitrary table metadata: the host can attach an application-specific bag of values that remains available wherever table context is used (for example, a currency code or permission flags).
- Resetting state: the host can restore one slice or all slices to the values used at initialization, or to empty defaults.

## Data input

- Flat object rows: each item in the data array becomes one logical row.
- Nested object paths: a column can read a value from a nested field (for example, a name object with a first field).
- Computed values: a column can derive a primitive from the whole row (for example, concatenating first and last name). Values used for sort, filter, and group should be primitives unless the host supplies custom comparators.
- Array-shaped rows: a column can read a value by index when each record is a tuple rather than a named object.
- Unknown / dynamic row shape: when the schema is not known at compile time (CSV upload, arbitrary API), columns can be generated from keys at runtime.
- Hierarchical source data: a row can declare child records used for expansion or nested display.
- Stable row identity: each row has a unique id. By default this can be the source index. The host can supply a durable id from the record (database key, uuid) so selection, expansion, and pinning survive reorder, filter, and pagination.
- Display index: the UI can show a 1-based or 0-based number that follows the current visible order after filter, group, sort, and expand, not the original array index. Rows that are not in the current display order report as absent.
- Original record access: from any row or cell, the host can read the untouched source object, even if accessors transformed the displayed value.

## Column definitions

- Accessor columns: columns that extract a value and therefore can participate in sort, filter, group, and aggregate.
- Display columns: columns with no data model, used for checkboxes, action menus, expand controls, or charts.
- Group columns: columns that only nest other columns under a shared header or footer and do not themselves extract a value.
- Nested column trees: groups can contain groups. Header rows reflect that depth.
- Unique column identity: every column has a stable unique id, inferred from the accessor path, a string header, or an explicit id.
- Per-column formatters:
  - Body cell content (string, template, or function).
  - Header content.
  - Footer content.
  - Aggregated cell content when the row is a group total rather than a source row.
- Fallback display value: when the accessed value is missing, the cell can render a configured fallback instead of blank.
- Per-column enablement: a column can opt out of sort, filter, hide, pin, resize, select, span, and similar behaviors even when the table enables them.
- Per-column metadata: the host can attach typed extra data to a column (filter widget kind, alignment, detected data type) without the engine interpreting it.
- Dynamic column generation: rebuild the column list from incoming keys, detect value types from samples, and pick appropriate sort/filter behavior per type. Rebuild only when the schema actually changes.

## Headers, footers, and header groups

- Header groups for rendering thead: produce one row of header cells per depth in the column tree, already accounting for visibility and pinning.
- Footer groups for rendering tfoot: produce footer rows in reverse depth order so grouped footers line up with the body.
- Iterating header cells: each header group yields the cells to render in that row, with enough identity for Angular `@for` tracking.
- Column span on headers: a group header reports how many leaf columns it covers so the host can set the HTML column-span attribute.
- Row span on uneven header trees: when some leaves are nested deeper than others, placeholder headers fill the gaps. The top of a placeholder chain reports how many header rows it covers; covered headers report zero span and must be skipped in the DOM (a zero HTML row-span would mean “span the rest of the section”).
- Placeholder vs real headers: the host can tell empty alignment placeholders from headers that should show a label. Footers should keep placeholders as empty cells because reverse order makes vertical merging unsafe there.
- Header context for formatters: header and footer renderers receive the column and table, not a data row.
- Flat header lists: the host can iterate all headers (or only leaf headers) for menus, resize handles, or accessibility descriptions, including variants split by pinned region.

## Rows and cells for rendering

- Rows to render: the host iterates the current view of rows (after enabled pipeline steps) to produce body rows in the DOM.
- Looking up a row by id: useful for restoring focus, scrolling a virtualizer to a row, or acting on a selection.
- Core vs derived rows: the host can inspect the unmodified mapping of source data, and also the rows after filter, group, sort, expand, and page.
- Row model shapes:
  - Ordered array for rendering.
  - Flattened array that includes nested children at the top level (for export or “select all nested”).
  - Id map for fast lookup.
- Cells on a row: iterate all cells, only visible cells, or cells split into start-pinned, center, and end-pinned regions.
- Cell identity: each cell is uniquely identifiable, typically from its row id and column id, remaining stable enough for tracking and selection.
- Reading a cell value: get the accessed primitive, with optional fallback when undefined. Results should be cached so repeated reads during render are cheap.
- Reading another column from a cell: a cell can reach sibling values through its parent row.
- Parent/child row relationships: nested or grouped rows expose depth, parent, and children so the UI can indent, show expand buttons, and draw tree lines.
- Deepest nesting: the host can know the maximum structural depth (for padding or “expand all” limits).
- Row context for custom cells: a cell renderer can receive the row, column, table, and value so action buttons and composed cells work without extra wiring.

## Rendering resolution

- Resolve header, cell, and footer content that may be a string, a function, or an Angular template/component, using the correct context object.
- Skip covered cells: when a header or body cell reports a zero span, do not emit an element.
- Apply HTML span attributes only for spans of one or more.

## State management

- Internal default: if the host does not own a slice, the table stores it.
- Initial values: the host can seed sort, filters, page, selection, visibility, order, pinning, and sizes without taking ongoing ownership.
- Controlled slices: the host can own any slice (for URL query params, persisted layouts, or server queries) and push updates back in.
- Fine-grained reactivity: the host can subscribe to one slice (for example, only selection) without rerunning unrelated UI.
- Updaters: state changes can be a next value or a function of the previous value.
- Change notifications: when the host owns a slice, updates from table interactions flow out so the host can persist or refetch.
- Auto-reset policies: some slices reset when data or upstream state changes (page index after filter, cell selection after data replace). The host can disable or override those resets, including a global “reset everything on data change” behavior.
- Do not mix initial and controlled values for the same slice; controlled values win.

## Data pipeline (row models)

- Core mapping: wrap each source record as a row with cells, without reordering.
- Pipeline order when capabilities are enabled: filter, then group/aggregate, then sort, then expand, then paginate. The rows used for DOM iteration are the end of that pipeline.
- Skip a step: if the host marks a step as manual (server-owned), that step does not transform rows; the supplied data is assumed to already reflect it.
- Inspect pre-step views: the host can read the row set before filter, before group, before sort, before expand, and before page (for “N of M rows”, exports, or debugging).
- Custom pipeline steps: an advanced host can replace a client-side transform with its own implementation.
- Selected-row views: selected rows can be listed from the core set, after filtering, or after grouping/sorting, with the caveat that only rows present in the current data can be materialized.

## Sorting

- Sort state: an ordered list of columns with direction (ascending or descending), supporting one or many columns.
- Client-side reorder: when enabled, rows are ordered in the browser using each column’s comparator.
- Server-side sort: the table only stores sort state; the host sends it to a backend and feeds back already-sorted rows.
- Toggle from a header: clicking a header (or a sort control) cycles none → first direction → opposite direction → none, unless removal is disabled.
- First direction: strings typically start ascending; numbers typically start descending. The host can override per column or table-wide. Columns with nulls may need an explicit first direction.
- Invert comparison: ranking-style columns (1 is best) can invert the actual order while the UI still shows asc/desc as usual.
- Missing values: undefined values can sort first, last, with a numeric priority, or as ties deferred to the next sort key / original order.
- Disable sort: table-wide or per column, including hiding sort UI.
- Multi-sort: holding a modifier key (Shift by default) adds a column to the sort list. The host can change the modifier, always multi-sort, disable multi-sort, cap how many columns may participate, and control whether a column can be removed from a multi-sort.
- Sort rank badge: a column can report its position in the multi-sort list (first, second, …) for UI.
- Next direction preview: the UI can announce what the next click will do (asc, desc, or clear) for tooltips and aria-labels.
- Built-in comparators: case-insensitive and case-sensitive text, alphanumeric natural sort, datetime, and basic numeric/lexicographic compare.
- Custom comparators: per column or as a named registry. A comparator compares two rows and returns ordering; the engine applies the current desc/asc.
- Auto-detect comparator from data type when none is specified.
- Consistency with paging/filter: if the server owns paging or filtering, it should also own sorting for the full dataset; client sort would only order the loaded page.

## Column filtering

- Per-column filter state: many columns can have independent filter values at once.
- Client-side filter: rows that fail a column’s predicate are removed from the view (subject to tree-filter rules below).
- Server-side filter: the table stores filter values; the host queries with them and supplies already-filtered rows.
- Connecting a filter widget: the UI can read and write a column’s filter value for inputs, selects, and range sliders.
- Active-filter indicator: a column can report whether it currently filters, and in what order among active filters.
- Disable filtering: all filters, all column filters, or one column.
- Built-in predicates: case-sensitive/insensitive includes and equals, array includes (any/all/some), strict and loose equality, numeric range.
- Custom predicates: return whether a row should remain. Optional helpers to normalize the filter input and to auto-clear empty/falsy values from state.
- Filter value resolution: a predicate can sanitize the stored value (trim, lowercase, parse numbers) before comparison.
- Tree filtering:
  - Default: if a parent fails, its children are hidden.
  - Leaf-up: keep a parent if any descendant matches.
  - Depth limit: only filter down to a given nesting level so children of a matching parent stay visible.

## Global filtering

- One search value applied across columns (typically a toolbar search box).
- Depends on column filtering being available; it is a cross-column pass, not a separate engine.
- Columns can opt out (ids, action columns).
- Table-wide disable.
- Shared or dedicated predicate (often a fuzzy or “includes text” function).
- Client or server, with the same manual-processing split as column filters.
- Combine with column filters: a row must pass both.

## Faceting (filter UI helpers)

- Unique values and counts for a column, used to build checkbox lists or autocomplete suggestions.
- Min and max for numeric (or comparable) columns, used to build range sliders.
- Facets derived from the appropriate pre-filter row set so options do not disappear as the user filters other columns (typical faceted-search behavior), unless the host chooses otherwise.
- Server-provided facets: the host can supply unique values or ranges from a backend instead of scanning client rows.
- Limit suggestion lists in the UI (for example, first N sorted unique values) without the engine forcing a cap.

## Grouping

- Group-by state: an ordered list of column ids. Rows are nested: first by column A, then by B inside each A group.
- Group rows: a synthetic parent appears at the position of the first member; members become children. Members are removed from the top-level list.
- Expand grouped rows: grouping is usually paired with expanding so users can collapse categories.
- Grouped-column layout:
  - Reorder grouped columns to the start of the table.
  - Remove grouped columns from the body (values live on the group row).
  - Leave column positions unchanged.
- Disable grouping per column or table-wide.
- Toggle a column in or out of the group list from a header menu.
- Manual grouping: the host supplies pre-grouped rows (server aggregation).
- Grouping does not reorder pinned columns; pinning wins over manual order, which wins over grouped-column reorder.

## Aggregation

- When rows are grouped, compute summary values for each group (and optionally grand totals).
- Built-in reducers: sum, count, min, max, extent (min and max), mean, median, unique values, unique count.
- Default reducer: numeric columns tend to sum; others tend to count. Override per column.
- Custom reducers: given the column, leaf rows, and child rows, return a summary value.
- Aggregated cell rendering: group rows use the aggregated formatter when present.
- Per-column multi-aggregations if a column needs more than one summary.
- Manual aggregation: summaries arrive with server-grouped data.

## Expanding

- Expanded state: which row ids are open, or a sentinel meaning “all expanded”.
- Child rows from data: a function on the source record returns children (nested people, comments, line items).
- Detail panels: a row can expand to custom UI that is not extra table rows sharing the same columns (a full-width detail cell). The host decides markup; the engine only tracks open/closed and whether the row may expand.
- Can-expand: by default only rows with children can expand; the host can allow every row (detail panels) or a predicate.
- Toggle one row, expand all, collapse all.
- Expand all to a maximum depth.
- Client-side flattening: when a parent is open, its children are inserted into the render list at the correct depth.
- Server-side expanding: the host fetches children on demand and puts them on the data tree; the engine does not invent child rows.
- Filter interaction: see tree filtering under column filtering.
- Pagination interaction: expanded children can count toward page size (they may spill onto the next page) or always stay on the parent’s page (the page may render more rows than the page size).
- Sorting children: by default children sort with the table; grouping/expansion still preserve parent/child structure.
- Pinning expanded rows follows the same rules as other rows.

## Pagination

- Page state: zero-based page index and page size.
- Client-side paging: the render list contains only the current page’s rows.
- Server-side paging: the data array is already one page; the host must provide total row count or total page count so the UI can render pagers.
- Unknown total: the UI can still go next/previous through fetched pages, but “last page” and “disable next” cannot be known until the backend says so.
- Navigation: first, previous, next, last, jump to index, change page size, reset page or size to initial values.
- Disable controls: previous disabled on the first page; next disabled when there is no further page (unless total is unknown).
- Page and row counts for “showing 21–40 of 200”.
- Auto-reset page index to the first page when filters, grouping, sorting, or data change; optional override. When the server owns paging, auto-reset defaults off so the host controls refetch.
- Keep previous page data / loading: not owned by the table; the host should avoid applying stale responses. Document the expectation.

## Row selection

- Selection state keyed by row id (presence means selected), so ids not on the current page can remain selected.
- Materialized selected rows: list selected row objects from current data after core, filter, or group/sort. With server paging, only selected rows on the loaded page can be materialized; the id map can still hold off-page ids.
- Multi-select by default; single-select mode for radio-style tables.
- Conditional selectability: only some rows can be selected (for example, rows that are not locked).
- Parent selects children: optional. Selecting a parent can select all sub-rows, or parents and children can be independent.
- Header checkbox: select all rows in the table, or only rows on the current page.
- Indeterminate state: some but not all (page or all) rows are selected, for header checkboxes.
- Row click or per-row checkbox: toggle one row.
- Disable selection table-wide.
- Selection survives sorting and filtering by id; it does not invent rows that are not in `data`.

## Cell selection (spreadsheet-style)

- Rectangular ranges stored by corner cell identities (row id + column id), not by pixel.
- Click to focus a cell; Shift-click or Shift-arrow to extend the active rectangle; drag to grow the rectangle.
- Additive / subtractive ranges: a modifier (Ctrl/Cmd by default) starts a new rectangle. Starting on an unselected cell includes; starting on a selected cell excludes. The include vs exclude decision is fixed when the gesture starts.
- Replace vs include vs exclude when setting a range programmatically.
- Per-cell and per-column opt-out (action columns usually cannot be selected).
- Keyboard: move the focus by one cell, skipping unselectable columns; extend in a direction; select all selectable cells.
- Focus vs selected: the active cell is the anchor of the latest operation and can be focused even during an exclusion.
- Counts and ids of selected cells; ids of intersected rows and columns.
- Copy-oriented values: export selected regions as a row-major grid of values. Serialization to clipboard (tabs, quoting) stays in the host.
- Outline edges: a selected cell can report which sides sit on the selection border so the UI can draw a spreadsheet outline without neighbor probing.
- Roving tabindex: only the focused cell is tabbable (`0`); others are `-1`.
- Drag lifecycle: mousedown starts, mouseenter extends, mouseup ends even if released outside the table (including other documents such as an iframe).
- Reset selection when data is replaced, by default, because ids may point at gone rows or silently match new rows.
- Interaction with merged cells: a selection that touches any part of a merge selects or deselects the whole merge. Navigation treats a merge as one stop. Stored corners stay unexpanded so they remain valid when merges change after sort or page.

## Cell spanning (body merges)

- Stateless: spans are recomputed from the rows currently rendered. Sorting, filtering, paging, and row pinning only change adjacency.
- Vertical merge: adjacent rows in a column with the same value (`Object.is`) can become one cell. Nullish values do not merge unless a custom predicate says so.
- Custom vertical predicate: decide whether a candidate row joins the run anchored at the first row.
- Horizontal merge: a cell can span N following visible columns in render order, clamped to its pinned region (start, center, or end). Infinity means “through the rest of this region”. Hidden columns are not counted.
- Covered cells report zero span and must be omitted from the DOM. Never output HTML row-span of zero.
- Runs never cross a page boundary, a pinned-row region boundary, a change of tree position, or a group row. Grouped columns ignore vertical spanning.
- Table-wide and per-column disable.
- Span index available for virtualizers that need to know where a merge starts relative to the rendered window.

## Column visibility

- Visibility map: a column is hidden when marked false; omitted or true means shown.
- Hidden columns are omitted from header groups and from each row’s visible cells.
- Toggle one column; show or hide all hideable columns.
- Prevent hiding (for example, a required id or selection column).
- “Are all / some columns visible?” for a view menu checkbox.
- Initial hidden columns (default layout) vs fully controlled visibility (saved user layout).

## Column ordering

- Default order is the order of definitions.
- Manual order: an array of column ids the user can drag to rearrange.
- Reorder helper: given a moving column and a drop target, produce the next id list.
- Order applies to unpinned columns. Pinned columns keep the order of their pin lists.
- Drag-and-drop is not bundled; the engine only stores order and yields columns in that order. The host attaches a DnD library or native drag events.

## Column pinning

- Pin a column to the start or end edge, or unpin it to the scrolling center.
- Pin state is two id lists (start and end). Those lists are the only order for pinned columns.
- Split rendering: the host can render three regions (or three tables) — start, center, end — each with matching headers and cells.
- Sticky rendering: the host can keep one table and use the pin state plus offset helpers to set sticky CSS.
- Offset helpers: start offset (left in LTR, right in RTL) and end offset for sticky positioning.
- First/last in a pin group: useful for edge shadows.
- Can-pin per column; table-wide disable.
- Default pins (selection column start, actions column end).
- Pinning is applied before manual column order and grouped-column reorder.

## Column sizing

- Each column has a size, minimum, and maximum. Defaults exist table-wide and per column.
- Size is a number the host maps to pixels, fr units, or CSS variables. The engine does not emit CSS.
- Read size from the column, header, or cell for width styles.
- Total table width as the sum of visible column sizes, for layout.
- Controlled or initial sizing maps (saved layouts).

## Column resizing

- Drag a header edge to change size, with mouse and touch.
- Clamp to min/max.
- Resize mode: update size continuously while dragging, or only when the drag ends (with a live delta indicator during the drag).
- Resize direction: LTR vs RTL so the drag delta matches writing direction.
- Enable/disable per column or table-wide.
- Live resize info: which column is being resized and the current delta, for a shadow line.
- Performance guidance for hosts: compute widths once per resize frame, avoid reading size independently on every cell, prefer CSS variables, and skip heavy body work while a drag is in progress.

## Row pinning

- Pin a row to the top or bottom region, or unpin it to the scrolling middle.
- Render three row lists: top, center, bottom, so sticky header/footer rows stay visible.
- Pinning is applied before sorting when both affect order: pinned rows leave the sorted center list.
- Keep pinned rows visible even if they would be filtered or paged out, or allow them to disappear with the view (host choice).
- Pin a row together with its leaf children and/or ancestor parents.
- Can-pin per row; table-wide disable.
- Index within a pinned region for CSS offsets.

## Client-side vs server-side processing

- For filter, group, sort, expand, facet, aggregate, and page, the host chooses:
  - Engine processes the full in-memory dataset, or
  - Engine stores UI state only and the host fetches processed data.
- If the server owns pagination, it should also own filter, group, sort, and aggregation that must apply to the full result set. Mixing is allowed only when the narrower scope is intentional (for example, sort within a server-provided group).
- When the server owns a step, pass totals the UI cannot infer (row count, page count, facet lists).
- Reset or validate page index when server-owned filters or sorts change.
- The engine does not fetch; it only exposes state the host can put on the wire.

## Type safety and helpers

- Row type flows into columns, cells, and accessors so invalid keys are compile-time errors when the schema is known.
- Enabled capabilities should narrow what exists on the table at compile time (no sort helpers on a table that did not enable sorting).
- Column helper utilities to build accessor, display, and group columns with inference.
- Named registries for sort, filter, and aggregation functions so column options can refer to them by name with type checking.
- Dynamic rows fall back to a generic record type and lose per-key inference.

## Angular adapter expectations

- Create and retain a table for a component lifetime, updating when signal inputs change.
- Expose derived rows, headers, and state as signals (or equivalently bindable reactive values) suitable for `@for` / `@if`.
- TrackBy-friendly identities on header groups, headers, rows, and cells.
- Template-friendly content: support `NgTemplateOutlet`-style cell/header templates in addition to functions and strings.
- `inject()`-friendly creation for services and components, without requiring NgModules.
- Do not require the host to use a specific CSS grid or `<table>` markup; both semantic tables and div grids must work.

## Accessibility support (engine-level, host still owns DOM)

The engine does not render DOM, but it must give the host enough data to meet WCAG AA:

- Sort: current direction, next direction, and whether the column is sortable, for `aria-sort` and button labels.
- Expand: expanded/collapsed and whether expansion is allowed, for `aria-expanded`.
- Row and cell selection: selected, indeterminate, disabled, focused cell, and selection edges.
- Pagination: page index, page count, can-go-next/previous.
- Visibility and pin menus: current state of each column.
- Unique ids for headers and cells so the host can wire `headers` attributes and labels.
- Display index and row id for “row N selected” announcements.

## Explicitly out of scope (parity note)

These appear in TanStack Table docs as recipes or sibling libraries, not as engine features to copy:

- Row and column virtualization (pair with a virtualizer using sizes and ids from this library).
- Fuzzy search as a special engine: implement as a custom filter/sort pair if needed.
- Drag-and-drop libraries, checkbox components, and CSS for sticky pins.
- Data fetching, caching, and query keys.
- Spreadsheet clipboard TSV formatting and Excel export.
- In-cell editing: treat cells as ordinary templates; the engine does not own editors.

## Suggested implementation order

Work in layers so each slice is demoable:

1. Table coordinator, data, column defs, headers/cells, core row mapping, render resolution.
2. State ownership (internal, initial, controlled) and Angular signals.
3. Visibility, ordering, pinning (columns), sizing and resizing.
4. Sorting, column/global filtering, faceting, pagination (client then server flags).
5. Row selection, expanding, row pinning.
6. Grouping and aggregation.
7. Cell spanning, then cell selection (including merge-aware selection).
8. Dynamic columns, metadata, accessibility helpers, virtualizer integration docs.
