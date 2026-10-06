import { useAppStore } from '../../store/useAppStore';
import { MIN_STROKE_WIDTH, MAX_STROKE_WIDTH } from '../../utils/constants';
import styles from './Toolbar.module.css';

export function StrokeWidthSlider() {
  const strokeWidth = useAppStore((s) => s.strokeWidth);
  const setStrokeWidth = useAppStore((s) => s.setStrokeWidth);

  return (
    <div className={styles.sliderContainer}>
      <input
        type="range"
        min={MIN_STROKE_WIDTH}
        max={MAX_STROKE_WIDTH}
        step={1}
        value={strokeWidth}
        onChange={(e) => setStrokeWidth(Number(e.target.value))}
        className={styles.slider}
        aria-label={`Stroke width: ${strokeWidth}`}
      />
      <span className={styles.sliderLabel}>{strokeWidth}</span>
    </div>
  );
}
