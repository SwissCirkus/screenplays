// Tests run TypeScript straight from the files, without the full type check (that is `npx tsc --noEmit`).
process.env.TS_NODE_TRANSPILE_ONLY = "true";
require("ts-node/register");
