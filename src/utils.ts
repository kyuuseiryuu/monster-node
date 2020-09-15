import axios from "axios";
import * as dotenv from "dotenv-flow";
import {w3cwebsocket} from "websocket";
import {JobState} from "./types";
import * as child_process from 'child_process';
import * as os from "os";
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

interface Store {
  ip: string;
  nodeId: string;
  ws: w3cwebsocket;
}

export async function executeJob(jobId: string) {
  if (!jobId) return;
  const api = `${process.env.DOMAIN}/api/job/${jobId}`;
  await request.put(api, {
    state: JobState.EXECUTING,
  });
  child_process.exec(`curl -fsSL ${api} | bash -s`, {
    cwd: os.homedir(),
  }, async (e, stdout, stderr) => {
    if (e) {
      await request.put(api, {
        error: e.message,
        state: JobState.FAILURE,
      });
      return;
    }
    await request.put(api, {
      state: JobState.SUCCESS,
      stdout: stdout.toString(),
      stderr: stderr.toString(),
    });
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
