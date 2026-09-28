"use client"

import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * The two pictures a spending dashboard owes its reader.
 *
 * A column of totals says what was spent; it does not say whether this month is like the
 * last one, or whether one category is eating the school. The bars answer the first and the
 * ring answers the second — and both are drawn from the same figures as the tables below, so
 * a chart can never tell a different story from the numbers beside it.
 */

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"]

const naira = (value: number) => `₦${Math.round(value).toLocaleString("en-NG")}`
const compact = (value: number) =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}m`
    : value >= 1_000
      ? `${Math.round(value / 1_000)}k`
      : String(value)

export function ExpenditureDashboardCharts({
  monthly,
  byCategory,
}: {
  monthly: Array<{ month: string; label: string; paid: string; count: number }>
  byCategory: Array<{ id: string; name: string; amount: string; count: number }>
}) {
  const trend = monthly.map((row) => ({ label: row.label, paid: Number(row.paid), count: row.count }))
  const share = byCategory.slice(0, 8).map((row) => ({ name: row.name, value: Number(row.amount) }))
  const total = share.reduce((sum, row) => sum + row.value, 0)

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Spending month by month</CardTitle>
          <CardDescription>
            Money actually paid out this session. A flat line is salaries; the spikes are everything else.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {trend.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing has been paid out this session yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={compact} tickLine={false} axisLine={false} fontSize={12} width={48} />
                <Tooltip
                  formatter={(value: number) => [naira(value), "Paid"]}
                  labelFormatter={(label) => `Month of ${label}`}
                  cursor={{ opacity: 0.1 }}
                />
                <Bar dataKey="paid" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Where it went</CardTitle>
          <CardDescription>
            {total > 0 ? `${naira(total)} paid across ${share.length} categories.` : "Paid expenditure only."}
          </CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {share.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing paid out yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={share} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
                  {share.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name) => [
                    `${naira(value)} · ${total > 0 ? Math.round((value / total) * 100) : 0}%`,
                    name,
                  ]}
                />
                <Legend verticalAlign="bottom" height={48} iconType="circle" fontSize={12} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
