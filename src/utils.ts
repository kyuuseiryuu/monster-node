import axios from "axios";

export const request = axios.create({
  headers: {
    Authorization: `Bearer ${process.env.TOKEN}`,
  }
});

export function getCronExpresion() {
  let n = process.env.JOB_CHECK_INTERVAL || 5;
  if (isNaN(Number(n)) || Number(n) < 1) {
    n = 5;
  }
  console.log(`CRON: ${n}s`);
  return `*/${n} * * * * *`;
}

