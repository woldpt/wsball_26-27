import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";

function readGitValue(command, fallback) {
  try {
    return execSync(command, { encoding: "utf8" }).trim();
  } catch {
    return fallback;
  }
}

const gitCommitShortSha = readGitValue("git rev-parse --short HEAD", "unknown");
const gitCommitCount = readGitValue("git rev-list --count HEAD", "0");

// https://vite.dev/config/
export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_COMMIT_SHA": JSON.stringify(gitCommitShortSha),
    "import.meta.env.VITE_APP_COMMIT_COUNT": JSON.stringify(gitCommitCount),
  },
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/auth": "http://localhost:3000",
      "/saves": "http://localhost:3000",
      "/admin": "http://localhost:3000",
    },
  },
});
