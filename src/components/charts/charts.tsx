import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

import { formatPercent } from '@/lib/format'
import { ChartTooltipContent, useChartPalette } from './chart-card'

const AXIS_PROPS = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11 },
} as const

/** Trend over time with a soft brand-gradient fill. */
export function AreaTrend({
  data,
  xKey,
  yKey,
  yLabel,
  height = 260,
  percent,
}: {
  data: object[]
  xKey: string
  yKey: string
  yLabel: string
  height?: number
  percent?: boolean
}) {
  const palette = useChartPalette()
  const gradientId = `area-${yKey}`

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.primary} stopOpacity={0.35} />
            <stop offset="100%" stopColor={palette.primary} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} stroke={palette.axis} {...AXIS_PROPS} />
        <YAxis
          stroke={palette.axis}
          {...AXIS_PROPS}
          domain={percent ? [0, 100] : undefined}
          tickFormatter={percent ? (v: number) => `${v}%` : undefined}
        />
        <Tooltip
          cursor={{ stroke: palette.grid }}
          content={
            <ChartTooltipContent formatter={(v) => (percent ? formatPercent(Number(v)) : String(v))} />
          }
        />
        <Area
          type="monotone"
          dataKey={yKey}
          name={yLabel}
          stroke={palette.primary}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Grouped or single-series bars. */
export function BarSeries({
  data,
  xKey,
  series,
  height = 300,
  layout = 'vertical',
  stacked,
}: {
  data: object[]
  xKey: string
  series: { key: string; label: string; color?: string }[]
  height?: number
  /** 'vertical' = upright bars; 'horizontal' = bars running left→right. */
  layout?: 'vertical' | 'horizontal'
  stacked?: boolean
}) {
  const palette = useChartPalette()
  const isHorizontal = layout === 'horizontal'

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={isHorizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 6, right: 12, bottom: 0, left: isHorizontal ? 8 : -18 }}
        barCategoryGap={isHorizontal ? '20%' : '25%'}
      >
        <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={isHorizontal} horizontal={!isHorizontal} />
        {isHorizontal ? (
          <>
            <XAxis type="number" stroke={palette.axis} {...AXIS_PROPS} />
            <YAxis type="category" dataKey={xKey} stroke={palette.axis} {...AXIS_PROPS} width={130} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} stroke={palette.axis} {...AXIS_PROPS} />
            <YAxis stroke={palette.axis} {...AXIS_PROPS} allowDecimals={false} />
          </>
        )}
        <Tooltip cursor={{ fill: palette.grid, fillOpacity: 0.35 }} content={<ChartTooltipContent />} />
        {series.length > 1 && (
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: palette.axis, paddingTop: 8 }}
          />
        )}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color ?? palette.series[i % palette.series.length]}
            radius={isHorizontal ? [0, 5, 5, 0] : [5, 5, 0, 0]}
            stackId={stacked ? 'stack' : undefined}
            maxBarSize={isHorizontal ? 22 : 44}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Donut breakdown with a centred total. */
export function DonutBreakdown({
  data,
  height = 260,
  centerLabel,
  centerValue,
  unit = '',
}: {
  data: { name: string; value: number; color?: string }[]
  height?: number
  centerLabel?: string
  centerValue?: string | number
  unit?: string
}) {
  const palette = useChartPalette()
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={entry.color ?? palette.series[i % palette.series.length]} />
            ))}
          </Pie>
          <Tooltip
            content={
              <ChartTooltipContent
                formatter={(v) => {
                  const n = Number(v)
                  const share = total ? ` (${((n / total) * 100).toFixed(0)}%)` : ''
                  return `${n}${unit}${share}`
                }}
              />
            }
          />
        </PieChart>
      </ResponsiveContainer>

      {(centerValue != null || centerLabel) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">{centerValue}</span>
          {centerLabel && <span className="text-xs text-muted-foreground">{centerLabel}</span>}
        </div>
      )}
    </div>
  )
}

/**
 * Attendance % against grade % — the fastest way to spot students who are
 * present but struggling, or absent but coping.
 */
export function PerformanceScatter({
  data,
  height = 320,
}: {
  data: { name: string; attendance: number; grade: number; exams: number }[]
  height?: number
}) {
  const palette = useChartPalette()

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 10, right: 16, bottom: 12, left: -12 }}>
        <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="attendance"
          name="Attendance"
          domain={[0, 100]}
          stroke={palette.axis}
          {...AXIS_PROPS}
          tickFormatter={(v: number) => `${v}%`}
          label={{ value: 'Attendance', position: 'insideBottom', offset: -6, fontSize: 11, fill: palette.axis }}
        />
        <YAxis
          type="number"
          dataKey="grade"
          name="Average grade"
          domain={[0, 100]}
          stroke={palette.axis}
          {...AXIS_PROPS}
          tickFormatter={(v: number) => `${v}%`}
        />
        <ZAxis type="number" dataKey="exams" range={[60, 340]} name="Exams" />
        <Tooltip
          cursor={{ strokeDasharray: '3 3', stroke: palette.grid }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as { name: string; attendance: number; grade: number; exams: number }
            return (
              <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
                <p className="font-medium text-foreground">{point.name}</p>
                <p className="mt-1 text-muted-foreground">
                  Attendance <span className="font-medium text-foreground">{formatPercent(point.attendance)}</span>
                </p>
                <p className="text-muted-foreground">
                  Average grade <span className="font-medium text-foreground">{formatPercent(point.grade)}</span>
                </p>
                <p className="text-muted-foreground">
                  {point.exams} {point.exams === 1 ? 'exam' : 'exams'}
                </p>
              </div>
            )
          }}
        />
        <Scatter data={data} fill={palette.primary} fillOpacity={0.65} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

/** Compact inline trend for stat rows. */
export function Sparkline({
  data,
  dataKey,
  height = 40,
  tone,
}: {
  data: object[]
  dataKey: string
  height?: number
  tone?: 'primary' | 'success' | 'danger'
}) {
  const palette = useChartPalette()
  const color = tone === 'success' ? palette.success : tone === 'danger' ? palette.danger : palette.primary

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.12} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
