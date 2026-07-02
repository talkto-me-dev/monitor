import { test, expect } from "bun:test";
import loadEnv from "../src/loadEnv.js";

const FULL = {
  DB_HOST: "127.0.0.1",
  DB_PORT: "5432",
  DB_USER: "status",
  DB_PASSWORD: "pwd",
  DB_NAME: "status",
  REDIS_HOST: "r.host",
  REDIS_PORT: "6379",
  REDIS_USERNAME: "u",
  REDIS_PASSWORD: "p",
  LARK: "https://lark/hook",
  PUSHPLUS: "token",
  PUSHPLUS_TOPIC: "topic",
  GOOGLE_TRAN: "key",
};

test("完整配置", () => {
  const conf = loadEnv(FULL);
  expect(conf.DB).toEqual({
    host: "127.0.0.1",
    port: 5432,
    username: "status",
    password: "pwd",
    database: "status",
    tls: undefined,
  });
  expect(conf.REDIS).toEqual({ host: "r.host", port: 6379, username: "u", password: "p" });
  expect(conf.LARK).toBe("https://lark/hook");
  expect(conf.PUSHPLUS).toEqual(["token", "topic"]);
  expect(conf.GOOGLE_TRAN).toBe("key");
});

test("DB_SSL 解析为 JSON", () => {
  const conf = loadEnv({ ...FULL, DB_SSL: '{"rejectUnauthorized":true}' });
  expect(conf.DB.tls).toEqual({ rejectUnauthorized: true });
});

test("缺关键项报错", () => {
  for (const key of ["DB_HOST", "DB_PASSWORD", "REDIS_HOST", "GOOGLE_TRAN"]) {
    const env = { ...FULL };
    delete env[key];
    expect(() => loadEnv(env)).toThrow(key);
  }
});

test("告警通道可以只配一个", () => {
  const only_lark = { ...FULL };
  delete only_lark.PUSHPLUS;
  expect(loadEnv(only_lark).PUSHPLUS).toBeUndefined();

  const only_pushplus = { ...FULL };
  delete only_pushplus.LARK;
  expect(loadEnv(only_pushplus).PUSHPLUS).toEqual(["token", "topic"]);
});

test("告警通道全缺报错", () => {
  const env = { ...FULL };
  delete env.LARK;
  delete env.PUSHPLUS;
  expect(() => loadEnv(env)).toThrow("告警通道");
});
