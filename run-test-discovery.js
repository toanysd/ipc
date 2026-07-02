const { exec } = require('child_process');
const fs = require('fs');

const cmd = 'node test-discovery.js';
exec(cmd, (error, stdout, stderr) => {
  fs.writeFileSync('test-discovery-output.txt', stdout + '\n' + stderr + '\n' + (error ? error.message : ''));
});
