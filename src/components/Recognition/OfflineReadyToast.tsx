import { useEffect, useState } from 'react';
import { usePwaStore } from '../../pwa/registerServiceWorker';
import { useRecognitionStore } from '../../store/useRecognitionStore';
import styles from './Recognition.module.css';

const SHOW_MS = 4000;

/** Brief "Available offline" badge once the service worker has cached everything. */
export function OfflineReadyToast() {
  const offlineReady = usePwaStore((s) => s.offlineReady);
  const model = useRecognitionStore((s) => s.model);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!offlineReady || model !== 'ready') return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [offlineReady, model]);

  if (!visible) return null;
  return (
    <div className={`${styles.badge} ${styles.badgeOk}`} role="status">
      Available offline
    </div>
  );
}
