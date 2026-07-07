/** Assign side-by-side columns for overlapping timed events in a single day column. */
export function assignOverlapLayout<T extends { id: string; start_time: string; end_time: string }>(
  events: T[],
): Map<string, { column: number; totalColumns: number }> {
  const sorted = [...events].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  )
  const layout = new Map<string, { column: number; totalColumns: number }>()
  const active: Array<{ id: string; end: number; column: number }> = []

  for (const event of sorted) {
    const start = new Date(event.start_time).getTime()
    const end = new Date(event.end_time).getTime()

    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].end <= start) active.splice(i, 1)
    }

    const usedColumns = new Set(active.map((a) => a.column))
    let column = 0
    while (usedColumns.has(column)) column++

    active.push({ id: event.id, end, column })

    const totalColumns = Math.max(...active.map((a) => a.column), column) + 1
    for (const a of active) {
      const existing = layout.get(a.id)
      layout.set(a.id, {
        column: a.column,
        totalColumns: Math.max(existing?.totalColumns ?? 1, totalColumns),
      })
    }
  }

  return layout
}
