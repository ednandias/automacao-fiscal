export function sleep(ms = 1000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomSleep(ms = 1000): Promise<number> {
  const time = ms * Math.max(Math.floor(Math.random() * 16), 1);

  return new Promise((resolve) => setTimeout(() => resolve(time), time));
}
