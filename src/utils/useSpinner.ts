import * as p from "@clack/prompts";

export function useSpinner() {
  const sp = p.spinner();

  return {
    start: (msg: string) => sp.start(msg),
    stop: (msg?: string) => sp.stop(msg),
  };
}
