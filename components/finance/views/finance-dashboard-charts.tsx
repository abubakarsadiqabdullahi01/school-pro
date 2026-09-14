"use client"

import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626"]

export function FinanceDashboardCharts({
  totals,
  counts,
}: {
  totals: { expected: string; paid: string; outstanding: string; discounts: string; exemptions: string }
  counts: { paid: number; partial: number; unpaid: number; waived: number }
}) {
  const moneyData = [
    { name: "Expected", value: Number(totals.expected) },
    { name: "Paid", value: Number(totals.paid) },
    { name: "Outstanding", value: Number(totals.outstanding) },
  ]
  const statusData = [
    { name: "Paid", value: counts.paid },
    { name: "Partial", value: counts.partial },
    { name: "Unpaid", value: counts.unpaid },
    { name: "Waived", value: counts.waived },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Collection Trend</CardTitle>
          <CardDescription>Expected, paid, and outstanding balances for the selected period.</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={moneyData}>
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value) => `NGN ${Number(value).toLocaleString()}`} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {moneyData.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Status</CardTitle>
          <CardDescription>How student charge lines are currently distributed.</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={88} label>
                {statusData.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
