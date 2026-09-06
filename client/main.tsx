import { createRoot } from "react-dom/client";
import { I18nProvider } from "@/lib/i18n";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <App />
  </I18nProvider>,
);
