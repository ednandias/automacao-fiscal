import { api } from "../services/api.js";
import type { NfeStatusResponse } from "../types/index.js";
import { sleep } from "../utils/sleep.js";

export async function pollJob(
  jobId: string,
  maxAttempts = 15,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = async () => {
      if (attempts++ >= maxAttempts) {
        return reject(
          new Error(`Job ${jobId} não terminou após ${maxAttempts} tentativas`),
        );
      }

      try {
        const response = await api.get<NfeStatusResponse>(
          `/nfe/status/${jobId}`,
        );

        const data = response.data;

        if (data.status === "success") return resolve(data.result);

        await sleep(4000);
        check();
      } catch {
        await sleep(4000);
        check();
      }
    };

    check();
  });
}
