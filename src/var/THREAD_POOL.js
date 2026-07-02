import { join } from "node:path";
import Piscina from "piscina";

export default new Piscina({
  filename: join(import.meta.dirname, "worker.js"),
  idleTimeout: 9e4,
});
