import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Global error boundary to prevent white screen on crash
class GlobalErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('[GlobalCrash]', error, info?.componentStack); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ textAlign: 'center', maxWidth: 480, padding: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>Dashboard konnte nicht geladen werden</h1>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 8, fontFamily: 'monospace' }}>
              {this.state.error?.message || 'Ein unerwarteter Fehler ist aufgetreten.'}
            </p>
            <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16, fontFamily: 'monospace' }}>
              {this.state.error?.stack?.split('\n').slice(0, 3).join('\n')}
            </p>
            <button
              onClick={() => { sessionStorage.clear(); localStorage.removeItem('jet_dashboard_cache'); window.location.reload(); }}
              style={{ padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
            >
              Cache leeren & neu laden
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Catch unhandled errors that slip past React
window.addEventListener('error', (e) => {
  console.error('[Window Error]', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled Promise]', e.reason);
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>,
)
