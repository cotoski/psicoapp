import type { ReactNode } from 'react'

export interface Column<T> {
  header: string
  render: (row: T) => ReactNode
}

export function Table<T extends { id: string }>({
  columns,
  rows,
  empty = 'Nenhum registro.',
}: {
  columns: Column<T>[]
  rows: T[]
  empty?: string
}) {
  if (rows.length === 0) return <div className="empty-state">{empty}</div>
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((c) => (
                <td key={c.header}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
