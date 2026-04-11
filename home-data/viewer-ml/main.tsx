/**
 * React 19 entry point for the Champions ML Insights Viewer.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { LanguageProvider } from "../viewer/LanguageContext";
import "../viewer/styles.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root element not found in ml.html");
}

createRoot(container).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>,
);
