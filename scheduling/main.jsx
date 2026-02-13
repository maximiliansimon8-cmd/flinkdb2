import React from 'react';
import ReactDOM from 'react-dom/client';
import SchedulingApp from './SchedulingApp';
import '../src/index.css';

ReactDOM.createRoot(document.getElementById('scheduling-root')).render(
  <React.StrictMode>
    <SchedulingApp />
  </React.StrictMode>
);
