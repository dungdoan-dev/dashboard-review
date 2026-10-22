"use client";

import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

/** One column: text(row) is what shows (sort(row) is what a text column sorts by); a column with value(row) is a number (right aligned, sorts by number, gets a bar, and a total when total is set). */
export type Col<R> = { label: string; text: (row: R) => string; render?: (row: R) => ReactNode; value?: (row: R) => number | null; total?: boolean; sort?: (row: R) => string };

/** Columns that add up across rows; ratios, rates, people counted over the whole range and the ads "Kết quả" (a different goal per campaign) do not. */
export const additive = (label: string) => !/CTR|CPC|Tần suất|Chi phí \/|Người|tiếp cận|Tỷ lệ|Kết quả/i.test(label);

const sumText = (x: number) => (Number.isInteger(x) ? x : Math.round(x * 100) / 100).toLocaleString("vi-VN");

/**
 * Sortable table (click a header; the first click sorts high to low) with a sticky first column, a light bar behind each number,
 * group heading rows while the table is in its own order, and a total row for the additive columns.
 */
export function ReachTable<R>({ rows, columns, rowKey, groupOf, rowClass, compact, sortable = true }: { rows: R[]; columns: Col<R>[]; rowKey: (row: R) => string; groupOf?: (row: R) => string; rowClass?: (row: R) => string | undefined; compact?: boolean; sortable?: boolean }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const max = useMemo(() => columns.map((c) => (c.value ? Math.max(0, ...rows.map((r) => c.value!(r) ?? 0)) : 0)), [rows, columns]);
  const defs = useMemo<ColumnDef<R>[]>(() => columns.map((c, i) => ({
    id: String(i),
    header: c.label,
    accessorFn: (row) => (c.value ? c.value(row) ?? undefined : (c.sort ?? c.text)(row)),
    sortUndefined: "last",
    sortDescFirst: !!c.value,
    cell: ({ row }) => (c.render ? c.render(row.original) : c.text(row.original)),
  })), [columns]);
  const table = useReactTable({ data: rows, columns: defs, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });

  const totals = columns.map((c) => (c.value && c.total ? rows.reduce((s, r) => s + (c.value!(r) ?? 0), 0) : null));
  let lastGroup = "";
  return (
    <div className={`summary-table summary-table-scroll reach-table${compact ? " compact" : ""}`}>
      <table>
        <thead>{table.getHeaderGroups().map((hg) => <tr key={hg.id}>{hg.headers.map((h, i) => {
          const sorted = h.column.getIsSorted();
          return <th key={h.id} scope="col" className={columns[i].value ? "num" : undefined} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}>
            {!sortable ? flexRender(h.column.columnDef.header, h.getContext()) : <button type="button" onClick={h.column.getToggleSortingHandler()}>{flexRender(h.column.columnDef.header, h.getContext())}{sorted === "asc" ? <ArrowUp size={13} /> : sorted === "desc" ? <ArrowDown size={13} /> : <ChevronsUpDown size={13} className="idle" />}</button>}
          </th>;
        })}</tr>)}</thead>
        <tbody>{table.getRowModel().rows.map((row) => {
          const group = groupOf && !sorting.length ? groupOf(row.original) : "";
          const heading = group && group !== lastGroup ? group : null;
          if (group) lastGroup = group;
          return <Fragment key={rowKey(row.original)}>
            {heading && <tr className="group-row"><th colSpan={columns.length}>{heading}</th></tr>}
            <tr className={rowClass?.(row.original)}>{row.getVisibleCells().map((cell, i) => {
              const col = columns[i];
              const v = col.value?.(row.original);
              const style = col.total && v && max[i] ? ({ "--p": Math.round((v / max[i]) * 100) } as CSSProperties) : undefined;
              return i === 0 ? <th key={cell.id} scope="row">{flexRender(cell.column.columnDef.cell, cell.getContext())}</th>
                : <td key={cell.id} className={col.value ? (col.total ? "num bar" : "num") : undefined} style={style}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>;
            })}</tr>
          </Fragment>;
        })}</tbody>
        {rows.length > 1 && totals.some((t) => t !== null) && <tfoot><tr>{columns.map((c, i) => i === 0 ? <th key={i} scope="row">Tổng</th> : <td key={i} className={c.value ? "num" : undefined}>{totals[i] === null ? "" : sumText(totals[i]!)}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}
