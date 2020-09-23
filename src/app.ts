import * as dotenv from 'dotenv-flow';
import * as si from 'systeminformation';
import {request, store, Func, uploadNetworkJob, getRandomStr} from './utils';
import {WebSocketMessageType} from "./types";
import {w3cwebsocket} from "websocket";

dotenv.config();

const port = process.env.WS_PORT || 46572;
//
// const username = getRandomStr();
// const password = getRandomStr();

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
    port,
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
  ws.onopen = async () => {
    console.log('connect to server');
    const payload = JSON.stringify({
      type: WebSocketMessageType.JOIN,
      data: process.env.TOKEN,
    });
    ws.send(payload);
    store.ws = ws;
  }
  ws.onmessage = async e => {
    try {
      const payload = JSON.parse(e.data.toString());
      const funcName = payload.func;
      const args = payload.args;
      const fn = Func[funcName];
      console.log({ funcName, args, fn });
      if (funcName && fn) {
        await fn(args);
      }
    } catch (e) {
      console.log(e.message);
    }
  }
  ws.onclose = () => {
    console.log('server connection closed.');
    setTimeout(wsConnect, 1000);
  }
}

async function bootstrap() {
  const success = await storeNodeInfo();
  if (!success) return;
  await wsConnect();
  uploadNetworkJob.start();
}

bootstrap().then();
