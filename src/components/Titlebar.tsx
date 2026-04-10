interface TitlebarProps {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}

export default function Titlebar({ theme, onToggleTheme }: TitlebarProps) {
  return (
    <div className="titlebar">
      {/* Left spacer for macOS traffic lights */}
      <div className="titlebar-traffic-spacer" />
      <div className="titlebar-title">NOVA</div>
      <div className="titlebar-actions">
        <button
          className="titlebar-theme-toggle"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M13.5 10.07A6.5 6.5 0 015.93 2.5 6 6 0 1013.5 10.07z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
