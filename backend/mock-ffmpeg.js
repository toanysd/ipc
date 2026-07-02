// mock-ffmpeg.js
setInterval(() => {
  // stay alive
}, 1000);

process.stdin.on('data', () => {
  // ignore 'q\n', do not exit
});

// Ignore SIGKILL? Wait, SIGKILL cannot be caught in Node, but we can't ignore it anyway.
// But wait! Let's ignore SIGTERM in case it was used, but it's using SIGKILL.
process.on('SIGTERM', () => {
  console.log('Mock received SIGTERM');
});
