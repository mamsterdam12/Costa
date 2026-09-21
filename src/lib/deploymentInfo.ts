// Identifies which deployment is currently serving the app, for the footer
// (src/components/Footer.tsx). Railway injects RAILWAY_DEPLOYMENT_ID and
// RAILWAY_GIT_COMMIT_SHA into the running process, but there's no
// "deploy completed at" variable -- startedAt is captured once, when this
// module is first loaded by the server process, which is as close a proxy
// as we get without baking a timestamp in at build time.
export const deploymentId = process.env.RAILWAY_DEPLOYMENT_ID || null;
export const gitCommitSha = process.env.RAILWAY_GIT_COMMIT_SHA || null;
export const startedAt = new Date().toISOString();
