import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PlayerProvider } from "./state/PlayerContext.jsx";
import { AuthProvider } from "./state/AuthContext.jsx";
import App from "./App.jsx";
import "./styles.css";

class AppErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Soungdify encountered a rendering error.", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return <main className="fatal-error"><h1>Soungdify hit an unexpected error</h1><p>Reload the app to continue. Your local library is unchanged.</p><button onClick={() => window.location.reload()}>Reload app</button></main>;
    }
    return this.props.children;
  }
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed.", error);
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <PlayerProvider>
            <App />
          </PlayerProvider>
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
);
