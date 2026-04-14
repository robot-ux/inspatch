import { createLogger } from "@inspatch/shared";

const logger = createLogger("bg");

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => logger.error("Failed to set panel behavior:", err));
});
