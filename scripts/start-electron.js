const { spawn } = require("child_process");
const electronBinary = require("electron");

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, ["."], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: childEnv,
  windowsHide: false
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
