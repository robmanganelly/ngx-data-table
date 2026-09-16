# API design (draft)

Draft surface. Names only, types `any`. Composition rules live in `architecture.md`; roadmap capabilities in `roadmap.md`. Every entry below cites the roadmap section it serves.

Split rule: **builder = what a row is. Feature = what you can do to rows.**

## 1. Builders

```ts
declare function createFlatTable(...features: any[]): any;
declare function createExpandableTable(...features: any[]): any;
declare function createTreeTable(...features: any[]): any;
declare function createGroupedTable(...features: any[]): any;
```

| Builder | Row is | Baked in | Brand |
| --- | --- | --- | --- |
| `createFlatTable` | one record | core row map, column tree, headers/footers, cells, render resolve, state primitives | `flat` |
| `createExpandableTable` | record + open/closed detail panel | flat core + detail state | `detail` |
| `createTreeTable` | node with child rows | flat core + row tree + expand state + flatten stage | `tree` |
| `createGroupedTable` | record **or** synthetic group row | flat core + grouping state + group stage + expand state | `grouped` |

Optional leading options arg (injector only): `createFlatTable(options, ...features)`.

Expansion state is **not** a feature: it is the reason `tree` and `grouped` exist, and detail open/closed is the reason `detail` exists. No `withExpanding`, no `withRowDetail`.

Server-side expanding needs no variant — the host puts children on the data tree; the engine never invents children either way.

## 2. Core members (from any builder)

```ts
table.data();  table.meta();  table.state();
table.allColumns();  table.leafColumns();  table.column(id);
table.headerGroups();  table.footerGroups();  table.flatHeaders();  table.leafHeaders();
table.coreRows();  table.rows();  table.row(id);  table.rowsById();  table.flatRows();
table.reset(slices?);  table.resetToEmpty(slices?);
```

| Node | Members |
| --- | --- |
| Column | `id`, `depth`, `parent`, `columns`, `leafColumns()`, `columnDef`, `meta` |
| Header | `id`, `column`, `depth`, `subHeaders`, `colSpan()`, `rowSpan()`, `isPlaceholder`, `context()` |
| Row | `id`, `index`, `displayIndex()`, `original`, `cells()`, `visibleCells()`, `cell(columnId)`, `value(columnId)` |
| Cell | `id`, `row`, `column`, `value()`, `renderValue()`, `context()` |

Per builder:

| Builder | Extra table members | Extra row members |
| --- | --- | --- |
| detail | `openRows()`, `setOpenRows()`, `closeAll()` | `isOpen()`, `canOpen()`, `toggleOpen()` |
| tree | `maxDepth()`, `expanded()`, `setExpanded()`, `resetExpanded()`, `toggleAllRowsExpanded()`, `expandToDepth(n)`, `isAllRowsExpanded()`, `isSomeRowsExpanded()`, `rowsBeforeExpand()` | `depth`, `parent`, `subRows`, `leafRows()`, `parentRows()`, `isExpanded()`, `canExpand()`, `toggleExpanded()`, `isAllParentsExpanded()` |
| grouped | tree expand members + `grouping()`, `setGrouping()`, `resetGrouping()`, `rowsBeforeGroup()` | tree row members + `isGroupRow`, `groupingColumnId`, `groupingValue`, `aggregates()` |

Roadmap: Table lifecycle, Rows and cells for rendering, Headers/footers, Expanding, Grouping.

## 3. Base features

| Feature | Kind | Roadmap |
| --- | --- | --- |
| `withData(signal)` | `Data` (required) | Data input |
| `withColumns(defs)` | `Columns` (required*) | Column definitions |
| `withDynamicColumns(source, options?)` | `Columns` (required*) | Dynamic column generation |
| `withSubRows(getSubRows)` | `SubRows` (required on tree) | Hierarchical source data |
| `withRowId(getId)` | `RowId` | Stable row identity |
| `withColumnDefaults(defaults)` | `ColumnDefaults` | Default column settings |
| `withTableMeta(meta)` | `TableMeta` | Arbitrary table metadata |
| `withAutoReset(policy)` | `AutoReset` | Auto-reset policies |

`*` exactly one of the two `Columns` features.

## 4. Column layout features (any builder)

| Feature | Table adds | Node adds |
| --- | --- | --- |
| `withColumnVisibility(arg?)` | `columnVisibility()`, `setColumnVisibility()`, `toggleAllColumnsVisible()`, `isAllColumnsVisible()`, `isSomeColumnsVisible()`, `visibleLeafColumns()` | column: `isVisible()`, `canHide()`, `toggleVisibility()` |
| `withColumnOrder(arg?)` | `columnOrder()`, `setColumnOrder()`, `resetColumnOrder()` | helper `moveColumn(order, fromId, toId)` |
| `withColumnPinning(arg?)` | `columnPinning()`, `setColumnPinning()`, `startLeafColumns()`, `centerLeafColumns()`, `endLeafColumns()`, `startHeaderGroups()`, `centerHeaderGroups()`, `endHeaderGroups()` | column: `pin(side)`, `pinned()`, `canPin()`, `pinnedIndex()`, `startOffset()`, `endOffset()`, `isFirstInPinGroup()`, `isLastInPinGroup()`; row: `startCells()`, `centerCells()`, `endCells()` |
| `withColumnSizing(arg?)` | `columnSizing()`, `setColumnSizing()`, `totalSize()`, `startTotalSize()`, `centerTotalSize()`, `endTotalSize()` | column: `size()`, `minSize`, `maxSize`, `resetSize()` |
| `withColumnResizing(options?)` | `resizeInfo()`, `isResizing()` | column: `canResize()`, `startResize(event)`, `resizeDelta()` |

Roadmap: Column visibility, Column ordering, Column pinning, Column sizing, Column resizing.

## 5. Pipeline features (client / manual pairs)

Pair members share one kind → passing both is a compile error. Manual variant = same state and methods, no stage.

```ts
withSorting(arg?)        | withManualSorting(arg?)          // kind Sorting
withColumnFilters(arg?)  | withManualColumnFilters(arg?)    // kind ColumnFilters
withGlobalFilter(arg?)   | withManualGlobalFilter(arg?)     // kind GlobalFilter
withFaceting(options?)   | withManualFaceting(source)       // kind Faceting
withPagination(arg?)     | withManualPagination(options)    // kind Pagination
```

| Feature | Table adds | Node adds |
| --- | --- | --- |
| sorting | `sorting()`, `setSorting()`, `resetSorting()`, `clearSorting()`, `rowsBeforeSort()` | column: `canSort()`, `sortDirection()`, `sortIndex()`, `nextSortDirection()`, `toggleSort(desc?, multi?)`, `clearSort()`, `canMultiSort()`, `sortHandler(event)` |
| column filters | `columnFilters()`, `setColumnFilters()`, `resetColumnFilters()`, `rowsBeforeFilter()` | column: `canFilter()`, `filterValue()`, `setFilterValue()`, `isFiltered()`, `filterIndex()` |
| global filter | `globalFilter()`, `setGlobalFilter()`, `resetGlobalFilter()` | column: `canGlobalFilter()` |
| faceting | — | column: `facetedRows()`, `facetedUniqueValues()`, `facetedMinMax()` |
| pagination | `pagination()`, `setPageIndex()`, `setPageSize()`, `resetPageIndex()`, `resetPageSize()`, `firstPage()`, `previousPage()`, `nextPage()`, `lastPage()`, `canPreviousPage()`, `canNextPage()`, `pageCount()`, `rowCount()`, `pageRange()`, `rowsBeforePage()` | — |

`withManualPagination` requires a row-count or page-count signal (may report unknown).

Roadmap: Sorting, Column filtering, Global filtering, Faceting, Pagination, Client vs server processing.

## 6. Row and cell features (any builder)

| Feature | Table adds | Node adds |
| --- | --- | --- |
| `withRowSelection(arg?)` | `rowSelection()`, `setRowSelection()`, `resetRowSelection()`, `toggleAllRowsSelected()`, `toggleAllPageRowsSelected()`*, `isAllRowsSelected()`, `isSomeRowsSelected()`, `isAllPageRowsSelected()`*, `isSomePageRowsSelected()`*, `selectedRows()`, `filteredSelectedRows()`, `groupedSelectedRows()` | row: `isSelected()`, `canSelect()`, `toggleSelected()`, `selectHandler(event)` |
| `withRowPinning(arg?)` | `rowPinning()`, `setRowPinning()`, `topRows()`, `centerRows()`, `bottomRows()`, `isSomeRowsPinned(pos?)` | row: `pin(pos)`, `pinned()`, `canPin()`, `pinnedIndex()` |
| `withCellSpanning(options?)` | `spanIndex()` | cell: `rowSpan()`, `colSpan()`, `isCovered()`, `spanAnchor()` |
| `withCellSelection(arg?)` | `cellSelection()`, `setCellSelection(ranges, mode)`, `resetCellSelection()`, `focusedCell()`, `selectAllCells()`, `moveFocus(dir)`, `extendSelection(dir)`, `selectedCellCount()`, `selectedCellIds()`, `selectedRowIds()`, `selectedColumnIds()`, `selectedValuesGrid()` | cell: `isSelected()`, `canSelect()`, `isFocused()`, `tabIndex()`, `selectionEdges()`, `pointerDown(e)`, `pointerEnter(e)` |

`*` page variants typed only when `Pagination` is present. `setCellSelection` mode: `'replace' | 'include' | 'exclude'`. Cell selection is merge-aware when `CellSpanning` is present.

Roadmap: Row selection, Row pinning, Cell spanning, Cell selection.

## 7. Topology-gated

Separate feature only when it carries its own algorithm. Otherwise a gated **option**, typed `never` on builders that cannot use it.

| Item | Form | Available on |
| --- | --- | --- |
| `withTreeFiltering({ mode, maxDepth })` | feature (leaf-up pass). Needs `ColumnFilters` | tree, grouped |
| `withGroupedColumnLayout(mode)` | feature. `'reorder' \| 'remove' \| 'none'` | grouped |
| `withAggregation(options?)` / `withManualAggregation()` | feature, kind `Aggregation`. Adds column `aggregationFn()`, cell `aggregatedValue()`, `isAggregated()`, `isPlaceholder()` | grouped |
| `withManualGrouping()` | feature, kind `GroupingStage` | grouped |
| `withRowSelection({ subRowSelection })` | option | tree, grouped |
| `withRowPinning({ includeLeafRows, includeParentRows })` | option | tree, grouped |
| `withPagination({ paginateExpandedRows })` | option | tree, grouped |
| `withColumns` grouping options (`enableGrouping`, `aggregationFn`) | column option | grouped |

Grouped column members: `canGroup()`, `isGrouped()`, `groupedIndex()`, `toggleGrouping()`.

Roadmap: Column filtering (tree filtering), Grouping, Aggregation, Row selection, Row pinning, Pagination.

## 8. Registries and built-in functions

```ts
declare function withSortingFns(registry: any): any;      // before withSorting
declare function withFilterFns(registry: any): any;       // before withColumnFilters
declare function withAggregationFns(registry: any): any;  // grouped, before withAggregation
```

Individually imported, never barrelled:

```ts
// ngx-data-table/sort-fns
sortAlphanumeric, sortAlphanumericCaseSensitive, sortText, sortTextCaseSensitive, sortDatetime, sortBasic

// ngx-data-table/filter-fns
filterIncludesString, filterIncludesStringSensitive, filterEqualsString, filterEquals, filterWeakEquals,
filterArrIncludes, filterArrIncludesAll, filterArrIncludesSome, filterInNumberRange,
defineFilterFn(predicate, { resolveFilterValue, autoRemove })

// ngx-data-table/aggregation-fns
aggSum, aggCount, aggMin, aggMax, aggExtent, aggMean, aggMedian, aggUnique, aggUniqueCount
```

Roadmap: Built-in comparators, Built-in predicates, Built-in reducers, Named registries.

## 9. Column schema helpers

Not features. Run once per defs identity.

```ts
declare function columnHelper<T = any>(): any;   // .accessor(pathOrFn, options?) .display(options) .group(options, columns)
declare function columnSchema(builder: any): any;
declare function applyColumns(schema: any): any;
declare function inferColumns(sample: any[], options?: any): any;
declare function detectValueType(values: any[]): any;
```

Column def options: `id`, `header`, `cell`, `footer`, `aggregatedCell`, `fallbackValue`, `meta`, `size`, `minSize`, `maxSize`, `sortFn`, `sortDescFirst`, `invertSort`, `sortUndefined`, `filterFn`, `aggregationFn`, `spanRows`, `spanColumns`, and `enableSorting` / `enableFiltering` / `enableGlobalFilter` / `enableHiding` / `enablePinning` / `enableResizing` / `enableGrouping` / `enableSpanning` / `enableCellSelection`.

Option typed `never` when its feature is not composed.

Roadmap: Column definitions, Per-column enablement, Per-column metadata, Type safety and helpers.

## 10. State primitives

```ts
declare function tableFeature(...parts: any[]): any;   // bundle a custom feature
declare function withTableState(initial: any): any;
declare function withTableComputed(factory: any): any;
declare function withTableMethods(factory: any): any;
declare function withTableHooks(hooks: any): any;
declare function patchTable(table: any, ...updaters: any[]): any;
declare function linkSlice(source: any): any;          // host WritableSignal → controlled slice
declare function withRowModelStage(stage: any, fn: any): any;  // deferred (architecture §9 adapter)
```

Every feature arg is initial value **or** host signal (controlled), never both.

Roadmap: State management, Custom pipeline steps.

## 11. Rendering and Angular glue

```ts
declare function resolveContent(content: any, context: any): any;  // string | fn | TemplateRef | Type
declare function shouldRender(node: any): any;                     // false when span is 0
declare function spanAttr(span: any): any;                         // null when < 1
declare class TableRenderOutlet {}                                 // *tableRender="def; context: ctx"
declare function provideTable(factory: any): any;
declare function injectTable(): any;
declare const TABLE: any;
```

Optional directives, separate entry points:

| Directive | Entry |
| --- | --- |
| `TableSortHeader` | `ngx-data-table/sort-header` |
| `TableResizeHandle` | `ngx-data-table/resize-handle` |
| `TableRowSelect`, `TableHeaderSelect` | `ngx-data-table/row-select` |
| `TableExpandToggle` | `ngx-data-table/expand` |
| `TableCellRange`, `TableRovingCell` | `ngx-data-table/cell-selection` |

Roadmap: Rendering resolution, Angular adapter expectations, Accessibility support.

## 12. Kinds, conflicts, prerequisites

```ts
declare const enum TableFeatureKind {
  Data, Columns, SubRows, RowId, ColumnDefaults, TableMeta, AutoReset,
  ColumnVisibility, ColumnOrder, ColumnPinning, ColumnSizing, ColumnResizing,
  Sorting, ColumnFilters, GlobalFilter, Faceting, Pagination,
  RowSelection, RowPinning, CellSpanning, CellSelection,
  SortingFns, FilterFns, AggregationFns,
  TreeFiltering, GroupingStage, GroupedColumnLayout, Aggregation,
}
```

Duplicate kind → error. Client/manual pairs share a kind, so exclusion is free.

Prerequisites (Input types): every non-base feature needs `Data` + `Columns`; `ColumnResizing` needs `ColumnSizing`; `GlobalFilter` and `Faceting` need `ColumnFilters`; `TreeFiltering` needs `ColumnFilters` + tree/grouped brand; `GroupingStage`, `GroupedColumnLayout`, `Aggregation`, `AggregationFns` need grouped brand; `SubRows` needs tree brand; named function options need the matching registry.

Dev-mode warning, not a type error: `withManualPagination` composed with a client `Sorting` / `ColumnFilters` / `GlobalFilter` — client work would apply to one page only. Roadmap permits intentional mixes.

Soft adaptation, no prerequisite: `CellSelection` + `CellSpanning` (merge-aware), `ColumnOrder` + `ColumnPinning` (order applies to center region), `AutoReset` reacting to whichever pipeline kinds exist.

## 13. Call sites

```ts
createFlatTable(
  withData(this.rows), withColumns(userColumns), withRowId((u) => u.id),
  withColumnVisibility(), withSorting(), withColumnFilters(), withGlobalFilter(),
  withPagination({ pageSize: 25 }), withRowSelection(),
);

createFlatTable(
  withData(this.page), withColumns(userColumns),
  withManualSorting(this.sortState), withManualColumnFilters(this.filterState),
  withManualPagination({ state: this.pageState, rowCount: this.total }),
);

createExpandableTable(
  withData(this.orders), withColumns(orderColumns),
);

createTreeTable(
  withData(this.orgChart), withSubRows((n) => n.reports), withColumns(orgColumns),
  withColumnFilters(), withTreeFiltering({ mode: 'leaf-up' }),
  withRowSelection({ subRowSelection: true }),
);

createGroupedTable(
  withData(this.sales), withColumns(salesColumns),
  withGroupedColumnLayout('reorder'), withAggregation(), withSorting(),
);

createFlatTable(
  withData(this.grid), withColumns(gridColumns),
  withColumnPinning(), withCellSpanning(), withCellSelection(),
);
```

## 14. Open questions

1. `createExpandableTable` (detail panel) vs `createTreeTable` (child rows) read alike. Rename the first to `createDetailTable`?
2. Registries as ordered features vs a plain argument on `withSorting` / `withColumnFilters`.
3. Auto-detected sort/aggregation functions: does detection pull every built-in in? If so, make it opt-in (`withAutoSortFns()`).
4. `withRowId`, `withColumnDefaults`, `withTableMeta`: separate features vs options on `withData` / `withColumns`. Separate = positional noise on every table.
5. Faceting's prerequisite on `ColumnFilters` — facets are filter-UI helpers, but the data is useful without filtering composed.
