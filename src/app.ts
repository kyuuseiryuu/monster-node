import * as dotenv from 'dotenv-flow';
import * as si from 'systeminformation';
import axios from 'axios';
import {request, store, Func, uploadNetworkJob} from './utils';
import {WebSocketMessageType} from "./types";
import {w3cwebsocket} from "websocket";
import * as http from "http";
import * as io from 'socket.io';
import * as cloudcmd from 'cloudcmd';
import * as criton from 'criton';

dotenv.config();

const port = process.env.WS_PORT || 46572;
const prefix = '/';

const app = require("express")();
const server = http.createServer(app);
const socket = io.listen(server, {
  path: `${prefix}socket.io`
});

const config = {
  name: 'cloudcmd - KaiJuu',
  vim: true,
  editor: 'edward',
  packer: 'zip',
  auth: true,
  username: 'kk',
  password: criton('123123'),
};

const filePicker = {
  data: {
    FilePicker: {
      key: process.env.TOKEN,
    }
  }
};

const modules = {
  filePicker,
};

const {
  createConfigManager,
  configPath,
} = cloudcmd;

const configManager = createConfigManager({
  configPath,
});

app.use(prefix, cloudcmd({
  socket,  // used by Config, Edit (optional) and Console (required)
  config,  // config data (optional)
  modules, // optional
  configManager, // optional
}));


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

async function initJob() {
  const api = `${process.env.DOMAIN}/api/jobs/node/${store.nodeId}/init`;
  await axios.post(api).catch();
}

async function bootstrap() {
  const success = await storeNodeInfo();
  if (!success) return;
  await initJob();
  await wsConnect();
  uploadNetworkJob.start();
  server.listen(port);
}

bootstrap().then();
