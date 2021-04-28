import * as dotenv from 'dotenv-flow';
import * as si from 'systeminformation';
import {request, store, uploadSysInfoJob, executeJob, uploadRunningProcess} from './utils';
import {WebSocketMessageType} from "./types";
import {w3cwebsocket} from "websocket";
import Invoker from "@kyuuseiryuu/ws-invoker";

dotenv.config();

let shouldReconnect = true;
let retryTimes = 0;

async function storeNodeInfo() {
  console.log('Store Node Information.');
  console.log('Get IP...');
  if (process.env.IP) {
    console.log('LOCAL IP');
    store.ip = process.env.IP;
  } else {
    const res = await request.get('https://api.ip.sb/jsonip')
    store.ip = res.data.ip;
  }
  console.log('IP: ', store.ip);
  const domain = process.env.DOMAIN;
  const [
    cpuData, memoryData, diskData,
  ] = await Promise.all([
    si.cpu(), si.mem(), si.diskLayout(),
  ]);
  const sysInfo = { cpuData, memoryData, diskData };
  console.log('Register Node...');
  const nodeRes = await request.post(`${domain}/api/node/register`, {
    ip: store.ip,
    name: process.env.NAME,
    sysInfo,
  });
  if (!nodeRes || !nodeRes.data.success) {
    return false;
  }
  store.name = nodeRes.data.data.name;
  store.nodeId = nodeRes.data.data._id;
  store.userId = nodeRes.data.data.user;
  console.log('NodeInfo', JSON.stringify(nodeRes.data.data, null, 2));
  return true;
}

async function wsConnect() {
  const domain = process.env.DOMAIN.replace('http', 'ws');
  const ws = new w3cwebsocket(`${domain}/ws/${store.nodeId}/touch`);
  const invoker = new Invoker(ws as any);
  invoker.implement('exit', () => {
    process.exit(0);
  });
  invoker.implement<string, any>('exec', async jobId => {
    await executeJob(jobId);
  });
  invoker.implement('kill', async pid => {
    return process.kill(pid);
  });
  store.ws = ws;
  store.invoker = invoker;
  ws.onopen = () => {
    setTimeout(() => {
      invoker.invoke<{ data: string }, boolean>(
        WebSocketMessageType.JOIN,
        { data: process.env.TOKEN },
        (authorized) => {
          console.log('Connect to server', authorized);
          if (!authorized) {
            shouldReconnect = false;
            ws.close();
          }
          retryTimes = 0;
        });
    }, 1000);
  }
  ws.onclose = () => {
    console.log('Server connection closed.');
    if (shouldReconnect) {
      console.log('Try to reconnect...', retryTimes++);
      if (retryTimes <= Number(process.env.MAX_RETRY) || 1000) {
        setTimeout(wsConnect, 1000);
      }
    }
  }
}

async function bootstrap() {
  const success = await storeNodeInfo();
  if (!success) return;
  await wsConnect();
  uploadSysInfoJob.start();
  uploadRunningProcess.start();
}

bootstrap().then();
