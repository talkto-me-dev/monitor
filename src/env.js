// 集中读取环境变量（bun 启动时自动加载工作目录下的 .env），缺关键项启动即报错

import loadEnv from "./loadEnv.js";

export const { DB, REDIS, LARK, PUSHPLUS, GOOGLE_TRAN } = loadEnv(process.env);
