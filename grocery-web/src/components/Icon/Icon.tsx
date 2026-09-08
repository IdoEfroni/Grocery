export type IconName =
  | 'barcode'
  | 'camera'
  | 'torch'
  | 'search'
  | 'trash'
  | 'edit'
  | 'image'
  | 'link'
  | 'plus'
  | 'check'
  | 'chevron'
  | 'alert'
  | 'settings'
  | 'home'
  | 'list'
  | 'receipt'

export interface IconProps {
  name: IconName
  /** Matches the surrounding text size by default. */
  size?: number | string
  className?: string
  /** Provide when the icon is the only content of a control. */
  title?: string
}

/**
 * Inline SVG icon set.
 *
 * Replaces the emoji the app used to use as icons. Emoji are rendered by the
 * platform font, so they differed between Android and iOS, could not inherit
 * colour, and sat off the text baseline. These inherit `currentColor` and
 * scale with font size, so they behave in both themes and both directions.
 *
 * Drawn on a 24x24 grid with a 2px stroke. Kept deliberately small rather than
 * pulling in an icon package for a dozen glyphs.
 */
const PATHS: Record<IconName, React.ReactNode> = {
  barcode: (
    <>
      <path d="M3 5v14M7 5v14M11 5v10M15 5v14M19 5v14" />
      <path d="M11 19h.01" />
    </>
  ),
  camera: (
    <>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7a1 1 0 0 0 .84-.46l.92-1.42A1 1 0 0 1 9.8 3.6h4.4a1 1 0 0 1 .84.52l.92 1.42a1 1 0 0 0 .84.46h1.7A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  torch: (
    <>
      <path d="M9 2h6l-1 5H10z" />
      <path d="M10 7h4l.7 4.2a2 2 0 0 1-.5 1.6L13 14v7h-2v-7l-1.2-1.2a2 2 0 0 1-.5-1.6z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 16-5-5-6 6-2-2-5 5" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a4 4 0 0 0 5.7.4l3-3a4 4 0 0 0-5.7-5.7L11.5 6" />
      <path d="M14 11a4 4 0 0 0-5.7-.4l-3 3a4 4 0 0 0 5.7 5.7L12.5 18" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m4 12 5.5 5.5L20 7" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  alert: (
    <>
      <path d="M12 4 2.5 20h19z" />
      <path d="M12 10v4M12 17.5h.01" />
    </>
  ),
  home: (
    <>
      <path d="M3 10.7 12 3.5l9 7.2" />
      <path d="M5.5 9.6V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.6" />
      <path d="M9.75 20.5v-5.25a2.25 2.25 0 0 1 4.5 0v5.25" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 2.5h12v19l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 0 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 0 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2 2 2 0 0 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9 2 2 0 0 1 0 4z" />
    </>
  ),
}

export default function Icon({ name, size = '1.25em', className, title }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      // Decorative unless given a title, in which case it is exposed as an image.
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={{ flex: 'none', verticalAlign: '-0.15em' }}
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  )
}
