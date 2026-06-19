import chalk from "chalk";

export function log(
  type: "success" | "info" | "warn" | "error",
  ...data: unknown[]
) {
  const c =
    type === "info"
      ? chalk.cyan
      : type === "success"
        ? chalk.green
        : type === "warn"
          ? chalk.magenta
          : chalk.red;

  console.log(c(...data));
}
