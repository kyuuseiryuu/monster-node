import axios from "axios";
import * as dotenv from "dotenv-flow";
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

