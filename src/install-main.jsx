import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import InstallApp from './InstallApp.jsx'

// Error boundary for standalone Install App
class InstallErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('[InstallApp Crash]', error, info?.componentStack); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', background: '#fefce8' }}>
          <div style={{ textAlign: 'center', maxWidth: 480, padding: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>Installations-Tool konnte nicht geladen werden</h1>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 8, fontFamily: 'monospace' }}>
              {this.state.error?.message || 'Ein unerwarteter Fehler ist aufgetreten.'}
            </p>
            <button
              onClick={() => { sessionStorage.clear(); window.location.reload(); }}
              style={{ padding: '10px 20px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
            >
              Neu laden
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <InstallErrorBoundary>
      <InstallApp />
    </InstallErrorBoundary>
  </StrictMode>,
)
