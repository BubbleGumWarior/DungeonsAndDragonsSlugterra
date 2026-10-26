// Tiny worker-thread pool. `setTable(builds)` ships the build table once; `run(jobs)`
// splits the jobs into chunks, keeps every worker busy, and resolves to the results
// in the same order as the jobs.
import { Worker } from "node:worker_threads";
import os from "node:os";

export class Pool {
  constructor(size = Math.max(1, os.cpus().length - 1)) {
    this.workers = Array.from({ length: size }, () => new Worker(new URL("./worker.mjs", import.meta.url)));
  }

  async setTable(table) {
    await Promise.all(this.workers.map((w) => new Promise((resolve) => {
      const onMsg = (m) => { if (m.type === "table-ok") { w.off("message", onMsg); resolve(); } };
      w.on("message", onMsg);
      w.postMessage({ type: "table", table });
    })));
  }

  run(jobs, chunkSize = 16) {
    return new Promise((resolve, reject) => {
      const results = new Array(jobs.length);
      let next = 0;
      let pending = 0;
      const feed = (w) => {
        if (next >= jobs.length) return;
        const start = next;
        next = Math.min(jobs.length, next + chunkSize);
        pending++;
        w.postMessage({ type: "jobs", chunk: start, jobs: jobs.slice(start, next) });
      };
      const handlers = this.workers.map((w) => {
        const h = (m) => {
          if (m.type !== "done") return;
          m.results.forEach((r, i) => { results[m.chunk + i] = r; });
          pending--;
          feed(w);
          if (pending === 0 && next >= jobs.length) { this.workers.forEach((x, k) => x.off("message", handlers[k])); resolve(results); }
        };
        w.on("message", h);
        w.on("error", reject);
        return h;
      });
      if (jobs.length === 0) return resolve(results);
      this.workers.forEach(feed);
    });
  }

  close() { return Promise.all(this.workers.map((w) => w.terminate())); }
}
