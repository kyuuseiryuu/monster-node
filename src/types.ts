import {w3cwebsocket} from "websocket";
import Invoker from "@kyuuseiryuu/ws-invoker";

export interface Store {
  name: string;
  ip: string;
  nodeId: string;
  userId: string;
  ws: w3cwebsocket;
  invoker: Invoker;
}


export enum WebSocketMessageType {
  JOIN = "JOIN",
  STDOUT = "STDOUT",
  UPDATE_NETWORK_STATUS = "UPDATE_NETWORK_STATUS",
  UPDATE_SYS_INFO = "UPDATE_SYS_INFO",
  PROCESS = "PROCESS",
  JOB_DONE = "JOB_DONE",
}

export enum JobState {
  INIT,
  CANCELED,
  EXECUTING,
  SUCCESS,
  FAILURE,
}

export interface NodeInfo {
  name: string,
  ip: string,
  node: string,
  user: string,
  job: string,
}

export interface JobMessage {
  nodeInfo: NodeInfo;
  type: WebSocketMessageType;
  event: string;
  data?: string | number;
}
