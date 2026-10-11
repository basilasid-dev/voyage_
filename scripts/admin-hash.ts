// Prints an ADMIN_PASSWORD_HASH value for .env.local.
//   pnpm admin:hash            (prompts; input is hidden)
//   pnpm admin:hash <password> (convenient, but the password stays in your shell history)
import { hashPassword } from "../src/lib/admin/auth-core";

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      let data = "";
      stdin.on("data", (c) => (data += c));
      stdin.on("end", () => resolve(data.trim()));
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n" || c === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (c === "\u0003") process.exit(130);
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const password = process.argv[2] ?? (await readHidden("New admin password: "));
  if (password.length < 12) {
    console.error("Use at least 12 characters (a long passphrase is best).");
    process.exit(1);
  }
  console.log("\nAdd these to .env.local (never commit it):\n");
  console.log(`ADMIN_PASSWORD_HASH=${hashPassword(password)}`);
  console.log("ADMIN_NAME=your-name   # shown in the audit log (optional)");
}

void main();
