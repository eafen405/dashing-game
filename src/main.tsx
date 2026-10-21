import { createRoot } from 'react-dom/client';
import App from './app/App';
import './styles.css';

const host = document.getElementById('root');
if (!host) throw new Error('#root not found');

createRoot(host).render(<App />);
