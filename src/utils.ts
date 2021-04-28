import axios from "axios";
import * as dotenv from "dotenv-flow";
import {JobState, NodeInfo, Store, WebSocketMessageType} from "./types";
import * as os from "os";
import {spawn} from "child_process";
import * as cron from 'node-cron';
import {w3cwebsocket} from "websocket";
import * as si from 'systeminformation';

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

export function getCronExpresion(defaultInterval: number = 10) {
  let n = process.env.NETWORK_UPLOAD_INTERVAL || defaultInterval;
  if (isNaN(Number(n)) || Number(n) < 1) {
    n = defaultInterval;
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
  curl.stdout.on("data", async data => {
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
  });
  sh.stderr.on("data", (data = '') => {
    stderr += data.toString();
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
    store.invoker.invoke(WebSocketMessageType.JOB_DONE, {
      node: store.nodeId,
      user: store.userId,
    });
  });
}

export const store = {} as Store;

export const uploadRunningProcess = cron.schedule(getCronExpresion(1), async () => {
  if (!store.ws || store.ws.readyState === w3cwebsocket.CLOSED) return;
  const processes = await si.processes();
  store.invoker.invoke(WebSocketMessageType.PROCESS, {
    node: store.nodeId,
    user: store.userId,
    data: JSON.stringify(processes),
  });
}, { scheduled: false });

export const uploadSysInfoJob = cron.schedule(getCronExpresion(), async () => {
  if (!store.ws || store.ws.readyState === w3cwebsocket.CLOSED) return;
  const [
    networkStats,
    cpu,
    mem,
    disksIO,
    fsStats,
  ] = await Promise.all([
    si.networkStats(),
    si.cpu(),
    si.mem(),
    si.disksIO(),
    si.fsStats(),
  ])
  const data = {
    node: store.nodeId,
    user: store.userId,
    data: JSON.stringify({
      networkStats: networkStats,
      cpu,
      mem,
      disksIO,
      fsStats,
    }),
  }
  store.invoker.invoke(WebSocketMessageType.UPDATE_SYS_INFO, data);
}, { scheduled: false });
