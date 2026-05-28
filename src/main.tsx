import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { colors } from './theme/theme';

document.body.style.margin = '0';
document.body.style.backgroundColor = colors.background;
document.body.style.color = colors.textPrimary;
document.body.style.fontFamily =
  "Inter, 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
document.body.style.fontSize = '14px';
document.body.style.userSelect = 'none';
(document.body.style as any).webkitFontSmoothing = 'antialiased';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
