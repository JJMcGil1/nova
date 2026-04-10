import { FiSettings, FiSun, FiMoon } from 'react-icons/fi'

interface TitlebarProps {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onOpenSettings: () => void
  settingsActive: boolean
}

export default function Titlebar({ theme, onToggleTheme, onOpenSettings, settingsActive }: TitlebarProps) {
  return (
    <div className="titlebar">
      <div className="titlebar-traffic-spacer" />
      <div className="titlebar-title">NOVA</div>
      <div className="titlebar-actions">
        <button
          className={`titlebar-action-btn ${settingsActive ? 'titlebar-action-btn-active' : ''}`}
          onClick={onOpenSettings}
          title="Settings"
        >
          <FiSettings size={14} />
        </button>
        <button
          className="titlebar-action-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <FiSun size={14} /> : <FiMoon size={14} />}
        </button>
      </div>
    </div>
  )
}
