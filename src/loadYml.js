import ymlLoad from "@3-/yml/load.js";
import { join, dirname } from "node:path";

const ROOT = dirname(import.meta.dirname);

// 递归把 ${VAR} 替换为环境变量，缺失即报错
export const envRef = (val, env = process.env) => {
  if (typeof val == "string") {
    return val.replace(/\$\{(\w+)\}/g, (_, key) => {
      const v = env[key];
      if (!v) throw new Error("配置引用的环境变量 " + key + " 未定义");
      return v;
    });
  }
  if (Array.isArray(val)) {
    return val.map((v) => envRef(v, env));
  }
  if (val && typeof val == "object") {
    Object.entries(val).forEach(([k, v]) => {
      val[k] = envRef(v, env);
    });
  }
  return val;
};

export default (path) => envRef(ymlLoad(join(ROOT, "conf", path + ".yml")));
