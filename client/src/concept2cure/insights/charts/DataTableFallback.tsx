import type { FC } from 'react';

/**
 * A visually-hidden data table that mirrors a chart's underlying values.
 *
 * Charts encode meaning with color and position; per README ("color never
 * alone") and WCAG-AA, the same information must be available to assistive
 * technology as text. Each chart renders one of these inside its `<figure>`.
 *
 * The `sr-only` utility (Tailwind) keeps the table off-screen visually while
 * leaving it in the accessibility tree.
 */
export interface DataTableFallbackProps {
  /** Accessible caption describing what the table represents. */
  caption: string;
  /** Column headers, in order. */
  columns: string[];
  /** Row cells, aligned to `columns`. */
  rows: Array<Array<string | number>>;
}

export const DataTableFallback: FC<DataTableFallbackProps> = ({ caption, columns, rows }) => {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, rowIndex) => (
          <tr key={rowIndex}>
            {cells.map((cell, cellIndex) => (
              <td key={cellIndex}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

DataTableFallback.displayName = 'DataTableFallback';
