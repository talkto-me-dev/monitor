import VPS_ID_IP from "./VPS_ID_IP.js";

export default new Map(VPS_ID_IP.entries().map(([name, [_, ip]]) => [ip, name]));
