import { useRecognitionStore } from '../../store/useRecognitionStore';
import styles from './Recognition.module.css';

/** Small badge: model download progress, or "Recognition unavailable". Hidden when ready. */
export function RecognitionStatus() {
  const model = useRecognitionStore((s) => s.model);
  const progress = useRecognitionStore((s) => s.loadProgress);
  const error = useRecognitionStore((s) => s.modelInfo.error);

  if (model === 'loading') {
    return (
      <div className={styles.badge} role="status">
        Loading handwriting model{progress > 0 ? ` ${Math.round(progress * 100)}%` : '…'}
      </div>
    );
  }
  if (model === 'unavailable') {
    return (
      <div className={`${styles.badge} ${styles.badgeError}`} role="status" title={error}>
        Recognition unavailable — drawing still works
      </div>
    );
  }
  return null;
}
