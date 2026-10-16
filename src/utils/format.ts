import humanizeDuration from "humanize-duration";

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

export function formatDuration(ms: number) {
  return humanizeDuration(ms, {
    language: "pt",
    round: true,
    maxDecimalPoints: 2,
    delimiter: " e ",
  });
}
