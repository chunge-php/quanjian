import type { FacilityCategory } from '@/lib/types'
import { CATEGORY_ICON } from '@/lib/ui/theme'

/** 界面图标：lucide 线条（ISC 许可），全站只用这一套线条语气 */
const UI_ICONS = {
  search: { paths: ['m21 21l-4.34-4.34'], circles: [[11, 11, 8]] as [number, number, number][] },
  x: { paths: ['M18 6L6 18M6 6l12 12'] },
  printer: {
    paths: [
      'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6',
      'M6 14h12v8H6z',
    ],
  },
  chevronDown: { paths: ['m6 9l6 6l6-6'] },
  crosshair: {
    paths: ['M22 12h-4M6 12H2m10-6V2m0 20v-4'],
    circles: [[12, 12, 10]] as [number, number, number][],
  },
  locate: {
    paths: ['M2 12h3m14 0h3M12 2v3m0 14v3'],
    circles: [[12, 12, 7]] as [number, number, number][],
  },
  layers: {
    paths: [
      'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z',
      'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12',
      'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17',
    ],
  },
  alert: {
    paths: [
      'm21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4m0 4h.01',
    ],
  },
  pin: {
    paths: [
      'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0',
    ],
    circles: [[12, 10, 3]] as [number, number, number][],
  },
  compare: {
    paths: [
      'M9 3H5a2 2 0 0 0-2 2v4m6-6l2 2m-2-2L7 5m8 16h4a2 2 0 0 0 2-2v-4m-6 6l2-2m-2 2l2 2M3 21l18-18',
    ],
  },
  swap: { paths: ['M8 3L4 7l4 4M4 7h16m-4 14l4-4l-4-4m4 4H4'] },
  walk: {
    paths: ['M13 4h-1l-3 6l3 2v5l-2 4M13 4l3 3l3 1M12 12l-3 3l-2 6'],
    circles: [[14, 2, 1.5]] as [number, number, number][],
  },
} as const

export type UiIconName = keyof typeof UI_ICONS

interface IconProps {
  name: UiIconName
  size?: number
  className?: string
  strokeWidth?: number
}

export function Icon({ name, size = 18, className, strokeWidth = 1.8 }: IconProps) {
  const def = UI_ICONS[name] as {
    paths: readonly string[]
    circles?: readonly [number, number, number][]
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {def.paths.map((d) => (
        <path key={d} d={d} />
      ))}
      {def.circles?.map(([cx, cy, r]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />)}
    </svg>
  )
}

export function CategoryIcon({
  category,
  size = 16,
  className,
}: {
  category: FacilityCategory
  size?: number
  className?: string
}) {
  const def = CATEGORY_ICON[category]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {def.paths.map((d) => (
        <path key={d} d={d} />
      ))}
      {def.circles?.map(([cx, cy, r]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />)}
    </svg>
  )
}
