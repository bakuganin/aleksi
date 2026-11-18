import { stdin, stdout } from "node:process";

import { createPasswordHash } from "../server/password.js";

function readSecret(prompt) {
  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = stdin.isRaw;

    const finish = (error) => {
      stdin.off("data", onData);
      stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk) => {
      const input = chunk.toString("utf8");
      for (const character of input) {
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u0003") {
          finish(new Error("Cancelled"));
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = Array.from(value).slice(0, -1).join("");
          continue;
        }
        if (character >= " " && character !== "\u007f") value += character;
      }
    };

    stdout.write(prompt);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

if (!stdin.isTTY || !stdout.isTTY) {
  console.error("Run this command in an interactive terminal.");
  process.exitCode = 1;
} else {
  try {
    const password = await readSecret("New editor password: ");
    const confirmation = await readSecret("Repeat password: ");
    if (password !== confirmation) throw new Error("Passwords do not match");
    const hash = await createPasswordHash(password);
    stdout.write(`\nSCHEDULE_ADMIN_PASSWORD_HASH='${hash}'\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unable to create password hash");
    process.exitCode = 1;
  }
}
