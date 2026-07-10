import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface SourceDatum {
  source: string
  count: number
}

interface SourceBarChartProps {
  data: SourceDatum[]
  accentColor: string
}

export default function SourceBarChart({ data, accentColor }: SourceBarChartProps) {
  const sorted = [...data].sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))

  return (
    <div className="w-full h-[220px] md:h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={sorted}
          margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="source"
            interval={0}
            tick={{ fontSize: 12, fill: 'rgb(55, 65, 81)' }}
            axisLine={{ stroke: 'rgb(156, 163, 175)' }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: 'rgb(55, 65, 81)' }}
            axisLine={{ stroke: 'rgb(156, 163, 175)' }}
            tickLine={false}
            width={36}
          />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            formatter={(value) => [`${value}`, 'Leads']}
            labelStyle={{ color: 'rgb(31, 41, 55)', fontSize: 12 }}
            itemStyle={{ color: 'rgb(31, 41, 55)', fontSize: 12 }}
          />
          <Bar dataKey="count" fill={accentColor} radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
