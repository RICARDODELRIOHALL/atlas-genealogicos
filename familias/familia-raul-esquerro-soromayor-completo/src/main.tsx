import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import AtlasApp from "@/components/atlas/AtlasApp";
import { APP_CONFIG } from "@/lib/app-config";
import "@/styles.css";

document.title = APP_CONFIG.appName;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AtlasApp />
    <Toaster />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL, updateViaCache: "none" })
      .catch((error) => console.error("No se pudo registrar el modo sin conexión", error));
  });
}

