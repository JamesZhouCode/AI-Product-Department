import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/foundation.css';
import './styles/primitives.css';

// 内网部署不设登录：直接进入主应用。
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
