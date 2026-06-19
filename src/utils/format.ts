import humanizeDuration from "humanize-duration";

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

export function formatDuration(ms: number) {
  // const totalSeconds = Math.floor(ms / 1000);
  // const minutes = Math.floor(totalSeconds / 60);
  // const seconds = totalSeconds % 60;

  return humanizeDuration(ms, {
    language: "pt",
    round: true,
    maxDecimalPoints: 2,
    delimiter: " e ",
  });
}
