// 纯函数：环境变量 → 配置对象，缺关键项直接报错

const need = (env, key) => {
  const val = env[key];
  if (!val) throw new Error("缺少环境变量 " + key + "，请参考 .env.example");
  return val;
};

export default (env) => {
  const conf = {
    DB: {
      host: need(env, "DB_HOST"),
      port: +need(env, "DB_PORT"),
      username: need(env, "DB_USER"),
      password: need(env, "DB_PASSWORD"),
      database: need(env, "DB_NAME"),
      tls: env.DB_SSL ? JSON.parse(env.DB_SSL) : undefined,
    },
    REDIS: {
      host: need(env, "REDIS_HOST"),
      port: +need(env, "REDIS_PORT"),
      username: need(env, "REDIS_USERNAME"),
      password: need(env, "REDIS_PASSWORD"),
    },
    LARK: env.LARK,
    PUSHPLUS: env.PUSHPLUS ? [env.PUSHPLUS, env.PUSHPLUS_TOPIC] : undefined,
    STATUS_PAGE: env.STATUS_PAGE,
  };
  if (!conf.LARK && !conf.PUSHPLUS) {
    throw new Error("LARK 和 PUSHPLUS 至少配置一个告警通道");
  }
  return conf;
};
