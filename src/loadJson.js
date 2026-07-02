import { join, dirname } from "node:path";
import read from "@3-/read";

const ROOT = dirname(import.meta.dirname);

export default (path) => JSON.parse(read(join(ROOT, "conf", path + ".json")));
