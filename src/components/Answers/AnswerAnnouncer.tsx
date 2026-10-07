import { useAnnouncementStore } from '../../answers/useAnswers';
import styles from './Answers.module.css';

/**
 * Screen-reader mirror of the canvas answers ("18 plus 4 times 3 equals 30").
 * The canvas itself is aria-hidden. Keying on `id` re-announces repeated text.
 */
export function AnswerAnnouncer() {
  const text = useAnnouncementStore((s) => s.text);
  const id = useAnnouncementStore((s) => s.id);
  return (
    <div className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
      <span key={id}>{text}</span>
    </div>
  );
}
