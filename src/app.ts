import * as dotenv from 'dotenv-flow';
import * as Koa from 'koa';
import * as Route from 'koa-route';
import * as koaWS from 'koa-websocket';
import * as cors from 'koa2-cors';
import * as si from 'systeminformation';
import * as child_process from 'child_process';
import axios from 'axios';
import * as cron from "node-cron";
import * as os from "os";
import { request, getCronExpresion } from './utils';

dotenv.config();

interface Store {
  ip: string;
  nodeId: string;
}

const store = {} as Store;
const app = koaWS(new Koa());

enum JobState {
  INIT,
  CANCELED,
  EXECUTING,
  SUCCESS,
  FAILURE,
}

async function executeJob(jobId: string) {
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

const jobTask = cron.schedule(getCronExpresion(), async () => {
  const api = `${process.env.DOMAIN}/api/job/node/${store.nodeId}/all`;
  const jobs = await request.get(api).catch(() => {
    return { data: { success: false }};
  });
  if (jobs && jobs.data.success && jobs.data.data.length) {
    console.log(jobs.data.data);
    jobTask.stop();
    for (const jobId of jobs.data.data) {
      await executeJob(jobId);
    }
    jobTask.start();
  }
}, { scheduled: false });

async function getSystemInfoData(): Promise<string> {
  const info = await si.networkStats();
  return JSON.stringify({
    network: info[0],
  });
}

async function storeNodeInfo(): Promise<boolean> {
  console.log('Store Node Information.');
  console.log('Get IP...');
  if (process.env.IP) {
    console.log('LOCAL IP');
    store.ip = process.env.IP;
  } else {
    const res = await axios.get('https://api.ip.sb/jsonip')
    store.ip = res.data.ip;
  }
  console.log('IP: ', store.ip);
  const domain = process.env.DOMAIN;
  console.log('Register Node...');
  const nodeRes = await request.post(`${domain}/api/node/register`, {
    ip: store.ip,
    name: process.env.NAME,
    wsPort: process.env.WS_PORT || 46572,
    wsPath: process.env.WS_PATH || 'stats',
  });
  if (!nodeRes.data.success) {
    return false;
  }
  store.nodeId = nodeRes.data.data._id;
  console.log('NodeInfo', nodeRes.data.data);
  return true;
}

function loadAppMiddleware() {
  app.use(cors({
    origin: ctx => {
      return ctx.request.header.origin;
    },
    credentials: true,
  }));

  app.use(Route.get('/', ctx => {
    ctx.body = {
      success: true,
      data: store,
    };
  }));

  app.ws.use(Route.get(`/${process.env.WS_PATH}` || '/stats',  async context => {
    console.log('Client Connected!');
    const id = setInterval(async () => {
      context.websocket.send(await getSystemInfoData());
    }, 2000);
    context.websocket.onclose = () => {
      console.log('Client Closed!');
      clearInterval(id);
    }
  }));
}
async function bootstrap() {
  const port = process.env.WS_PORT || 46572;
  const success = await storeNodeInfo();
  if (!success) return;
  await loadAppMiddleware();
  app.listen(port, async () => {
    jobTask.start();
  });
}

bootstrap().then();
