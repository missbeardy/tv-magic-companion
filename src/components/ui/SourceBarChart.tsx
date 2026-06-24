import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
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
  const chartHeight = Math.max(180, sorted.length * 38)

  return (
    <div className="w-full h-[220px] md:h-[260px]">
      <ResponsiveContainer width="100%" height={Math.max(chartHeight, 220)}>
        <BarChart
          layout="vertical"
          data={sorted}
          margin={{ top: 8, right: 28, left: 12, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="source" width={120} />
          <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} formatter={(value: number) => [`${value}`, 'Leads']} />
          <Bar dataKey="count" fill={accentColor} radius={[0, 8, 8, 0]}>
            <LabelList dataKey="count" position="right" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
