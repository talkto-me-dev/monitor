export default async ([srv, args]) => (await import("../ping/" + srv + ".js")).default(...args);
