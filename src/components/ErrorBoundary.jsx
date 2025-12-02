import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, background: '#fff3bf', borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>An error occurred rendering this view</h3>
          <p style={{ marginBottom: 8 }}>{this.state.error?.message || 'Unknown error'}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })} style={{ padding: '8px 12px', borderRadius: 6 }}>Dismiss</button>
        </div>
      );
    }
    return this.props.children;
  }
}
