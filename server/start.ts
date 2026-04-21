import { createApp } from "./index";

const port = Number(process.env.AI_WORKBENCH_PORT ?? "8787");
const app = createApp();

app.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`AI Workbench API listening at http://127.0.0.1:${port}`);
});

