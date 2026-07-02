import Redis from "@3-/ioredis";
import { REDIS } from "./env.js";

export default Redis(REDIS);
