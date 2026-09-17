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
  if (rows.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">{empty}</div>
  }
  return (
    <div className="w-full overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            {columns.map((c) => (
              <th
                key={c.header}
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
              {columns.map((c) => (
                <td key={c.header} className="px-4 py-3 align-middle">
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
