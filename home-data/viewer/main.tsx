/**
 * React 19 entry point for the Champions Meta Viewer (Track D).
 *
 * Mounts the single-page <App /> into #root declared in index-meta.html.
 * Vite bundles this together with the merged meta JSON so that the final
 * build/meta.html is a standalone file that can be opened via file://.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { LanguageProvider } from "./LanguageContext";
import "./styles.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root element not found in index-meta.html");
}

createRoot(container).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>,
);
