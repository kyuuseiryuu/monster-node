import axios from "axios";
import * as dotenv from "dotenv-flow";
import {JobMessage, JobState, NodeInfo, Store, WebSocketMessageType} from "./types";
import * as os from "os";
import {spawn} from "child_process";
dotenv.config();

export const request = axios.create({
  validateStatus: () => true,
});

request.interceptors.request.use(config => {
  config.headers.Authorization = `Bearer ${process.env.TOKEN}`;
  return config;
}, error => {
  console.log(error.message);
  return { data: { success: false, }};
});

request.interceptors.response.use(response => {
  if (response.data.message) {
    console.log(response.data.message);
  }
  return response;
}, error => {
  console.log(error.message);
});

export function getCronExpresion() {
  let n = process.env.JOB_CHECK_INTERVAL || 5;
  if (isNaN(Number(n)) || Number(n) < 1) {
    n = 5;
  }
  console.log(`CRON: ${n}s`);
  return `*/${n} * * * * *`;
}

export async function executeJob(jobId: string) {
  if (!jobId) return;
  const api = `${process.env.DOMAIN}/api/job/${jobId}`;
  let stdout = '', stderr = '', error = '';
  const nodeInfo: NodeInfo = {
    name: store.name,
    ip: store.ip,
    node: store.nodeId,
    user: store.userId,
    job: jobId,
  };
  await request.put(api, {
    state: JobState.EXECUTING,
  });
  const curl = spawn('curl', ['-fsSL', api], {
    cwd: os.homedir(),
  });
  const sh = spawn('sh', ['-s'], {
    cwd: os.homedir(),
  });
  curl.stdout.on("data", data => {
    sh.stdin.write(data);
    sh.stdin.end();
  });
  curl.on("error", (e) => {
    error += e;
  });
  sh.on("message", (message, sendHandle) => {
    console.log(message, sendHandle);
  });
  sh.stdout.on("data", (data = '') => {
    stdout += data.toString();
    if (!store.ws) return;
    store.ws.send(JSON.stringify({
      nodeInfo,
      type: WebSocketMessageType.STDOUT,
      event: 'stdout',
      data: data.toString(),
    } as JobMessage));
  });
  sh.stderr.on("data", (data = '') => {
    stderr += data.toString();
    if (!store.ws) return;
    store.ws.send(JSON.stringify({
      nodeInfo,
      type: WebSocketMessageType.STDOUT,
      event: 'stderr',
      data: data.toString(),
    } as JobMessage));
  });
  sh.on("error", e => {
    error += e.message;
  });
  sh.on("close", async () => {
    const success = !error;
    await request.put(api, {
      state: success ? JobState.SUCCESS : JobState.FAILURE,
      stdout, stderr, error,
    });
    if (!store.ws) return;
    store.ws.send(JSON.stringify({
      nodeInfo,
      type: WebSocketMessageType.STDOUT,
      event: 'close',
    } as JobMessage));
  });
}
export const store = {} as Store;

export const Func = {
  exit() {
    process.exit(0);
  },
  async exec(jobId) {
    await executeJob(jobId);
  }
}
