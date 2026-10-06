import { Toolbar } from './Toolbar/Toolbar';
import { Canvas } from './Canvas/Canvas';
import { useRecognition } from '../hooks/useRecognition';
import styles from './App.module.css';

export function App() {
  useRecognition();
  return (
    <div className={styles.app}>
      <Toolbar />
      <Canvas />
    </div>
  );
}
