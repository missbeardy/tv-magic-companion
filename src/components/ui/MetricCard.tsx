import { withOpacity } from './colorUtils'

type MetricCardVariant = 'hero' | 'secondary' | 'compact'

interface MetricCardProps {
  label: string
  value: number
  primaryColor: string
  variant?: MetricCardVariant
}

export default function MetricCard({
  label,
  value,
  primaryColor,
  variant = 'secondary',
}: MetricCardProps) {
  if (variant === 'hero') {
    return (
      <article
        className="card p-5 border-l-4"
        style={{
          borderLeftColor: primaryColor,
          backgroundColor: withOpacity(primaryColor, 0.08),
        }}
      >
        <p className="text-sm text-gray-600">{label}</p>
        <p className="font-display font-bold text-4xl text-gray-900 leading-none mt-2">{value}</p>
      </article>
    )
  }

  if (variant === 'compact') {
    return (
      <article className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="font-semibold text-base text-gray-800">{value}</p>
      </article>
    )
  }

  return (
    <article className="card p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="font-display font-bold text-3xl text-gray-900 leading-none mt-1">{value}</p>
    </article>
  )
}
