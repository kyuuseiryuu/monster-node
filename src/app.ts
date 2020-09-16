import * as dotenv from 'dotenv-flow';
import * as Koa from 'koa';
import * as Route from 'koa-route';
import * as koaWS from 'koa-websocket';
import * as cors from 'koa2-cors';
import * as si from 'systeminformation';
import axios from 'axios';
import {request, store, Func} from './utils';
import {WebSocketMessageType} from "./types";
import {w3cwebsocket} from "websocket";

dotenv.config();
const app = koaWS(new Koa());


async function getSystemInfoData(): Promise<string> {
  const info = await si.networkStats();
  return JSON.stringify({
    network: info[0],
  });
}

async function storeNodeInfo() {
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
    wsPort: process.env.WS_PORT || 46572,
    wsPath: process.env.WS_PATH || 'stats',
    sysInfo,
  });
  if (!nodeRes.data.success) {
    return false;
  }
  store.nodeId = nodeRes.data.data._id;
  console.log('NodeInfo', JSON.stringify(nodeRes.data.data, null, 2));
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
  ws.onclose = async () => {
    console.log('server connection closed.');
    setTimeout(wsConnect, 1000);
  }
}

async function initJob() {
  const api = `${process.env.DOMAIN}/api/jobs/node/${store.nodeId}/init`;
  await axios.post(api).catch();
}

async function bootstrap() {
  const port = process.env.WS_PORT || 46572;
  const success = await storeNodeInfo();
  if (!success) return;
  await loadAppMiddleware();
  await initJob();
  await wsConnect();
  app.listen(port);
}

bootstrap().then();
