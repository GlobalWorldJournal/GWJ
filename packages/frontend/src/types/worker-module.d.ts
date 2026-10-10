// Type surface for the Cloudflare Pages Advanced-Mode worker (`public/_worker.js`),
// so it can be imported in tests without an implicit-any. Only the fields the
// worker reads are declared.
declare module '*/public/_worker.js' {
  interface WorkerAssets {
    fetch(request: Request): Promise<Response>;
  }
  interface WorkerEnv {
    SITE_URL?: string;
    API_BASE_URL?: string;
    ASSETS: WorkerAssets;
  }
  interface WorkerModule {
    fetch(request: Request, env: WorkerEnv): Promise<Response>;
  }
  const worker: WorkerModule;
  export default worker;
}
