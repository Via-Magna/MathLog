import { Toolbar } from './Toolbar/Toolbar';
import { Canvas } from './Canvas/Canvas';
import styles from './App.module.css';

export function App() {
  return (
    <div className={styles.app}>
      <Toolbar />
      <Canvas />
    </div>
  );
}
