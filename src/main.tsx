import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'motion/react';
import App from './App';
import './styles.css';

const host = document.getElementById('root');
if (!host) throw new Error('#root not found');

createRoot(host).render(
  <LazyMotion features={domAnimation} strict>
    <App />
  </LazyMotion>,
);
