import { progressPayments } from "./payments";
import { settleDue } from "./trading";

const g = globalThis as typeof globalThis & { __jobsStarted?: boolean };

export function startJobs() {
  if (g.__jobsStarted) return;
  g.__jobsStarted = true;
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await settleDue();
      await progressPayments();
    } catch (e) {
      console.error("job error", e);
    } finally {
      running = false;
    }
  }, 2000);
}
