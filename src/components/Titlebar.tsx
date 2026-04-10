import { FiSun, FiMoon } from 'react-icons/fi'
import NovaLogo from './NovaLogo'

interface TitlebarProps {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}

export default function Titlebar({ theme, onToggleTheme }: TitlebarProps) {
  return (
    <div className="titlebar">
      <div className="titlebar-traffic-spacer" />
      <div className="titlebar-logo">
        <NovaLogo mode={theme} iconSize={20} fontSize={13} gap={8} />
      </div>
      <div className="titlebar-actions">
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
