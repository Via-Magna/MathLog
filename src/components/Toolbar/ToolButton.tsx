import type { ReactNode } from 'react';
import styles from './Toolbar.module.css';

interface ToolButtonProps {
  icon: ReactNode;
  label: string;
  isActive?: boolean;
  isDisabled?: boolean;
  onClick: () => void;
  shortcut?: string;
}

export function ToolButton({
  icon,
  label,
  isActive = false,
  isDisabled = false,
  onClick,
  shortcut,
}: ToolButtonProps) {
  return (
    <button
      className={`${styles.toolButton} ${isActive ? styles.active : ''}`}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      {icon}
    </button>
  );
}
