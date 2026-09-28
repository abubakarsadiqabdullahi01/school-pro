"use client"

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { formatNaira } from "@/lib/money"

type Row = { name: string; amount: string; budgetLimit: string | null; overBy: string | null }

/**
 * Named amounts as horizontal bars, in the order given.
 *
 * A bar rather than a pie: what is asked of a period is "what were the big ones", which is a
 * ranking, and a ranking is read off bars in one glance. A row that has passed a ceiling is
 * drawn in the destructive colour, so the same chart answers "and did anything blow its
 * budget" without a second legend — pass `budgetLimit: null` where that does not apply.
 *
 * The caller decides the order: the termly report hands over categories largest first, the
 * session report and the HR dashboard hand over their periods in calendar order.
 *
 * `plain` is for the one chart here that counts people rather than naira — a headcount
 * formatted as currency reads as a salary.
 */
export function SpendBarChart({
  rows,
  valueLabel = "Paid",
  plain = false,
}: {
  rows: Row[]
  /** What the tooltip calls the figure. */
  valueLabel?: string
  /** Format values as plain numbers rather than money. */
  plain?: boolean
}) {
  if (rows.length === 0) return null

  const data = rows.slice(0, 8).map((row) => ({
    name: row.name,
    amount: Number(row.amount),
    over: Boolean(row.overBy),
    limit: row.budgetLimit ? Number(row.budgetLimit) : null,
  }))

  // Naira in millions is unreadable in full on an axis, and the tooltip carries the exact
  // figure anyway.
  const compact = (value: number) =>
    plain || value < 1_000
      ? String(value)
      : value >= 1_000_000
        ? `${(value / 1_000_000).toFixed(1)}m`
        : `${Math.round(value / 1_000)}k`

  const readable = (value: number) => (plain ? String(value) : formatNaira(value))

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <XAxis
            type="number"
            tickFormatter={compact}
            stroke="var(--muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            stroke="var(--muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value: number, _name, item) => {
              const limit = (item?.payload as (typeof data)[number] | undefined)?.limit
              return [
                limit ? `${readable(value)} of ${readable(limit)}` : readable(value),
                valueLabel,
              ]
            }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              color: "var(--popover-foreground)",
              fontSize: "0.75rem",
            }}
          />
          <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
            {data.map((row) => (
              <Cell key={row.name} fill={row.over ? "var(--destructive)" : "var(--chart-1)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
