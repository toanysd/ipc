const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Find the first available port starting from startPort
function findAvailablePort(startPort, maxAttempts = 20) {
  return new Promise((resolve, reject) => {
    if (maxAttempts <= 0) {
      reject(new Error(`Không tìm được cổng rảnh sau nhiều lần thử (bắt đầu từ ${startPort - 20})`));
      return;
    }
    const server = net.createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      resolve(findAvailablePort(startPort + 1, maxAttempts - 1));
    });
  });
}

async function main() {
  // Default start port: 4200 (avoids common 3000/3001/3002 conflicts)
  // Override with PORT env var if needed
  const preferredPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 4200;
  
  let availablePort;
  try {
    availablePort = await findAvailablePort(preferredPort);
  } catch (err) {
    console.error(`\x1b[31m[Port Error]\x1b[0m ${err.message}`);
    process.exit(1);
  }

  if (availablePort !== preferredPort) {
    console.log(`\x1b[33m[Port Alert]\x1b[0m Cổng ${preferredPort} đang bị chiếm bởi ứng dụng khác.`);
    console.log(`\x1b[32m[Auto Port]\x1b[0m ✅ Tự động chuyển sang cổng rảnh: \x1b[1m${availablePort}\x1b[0m`);
  } else {
    console.log(`\x1b[32m[Port Check]\x1b[0m ✅ Cổng ${availablePort} rảnh. Khởi chạy Next.js dev server...`);
  }

  // Ghi port thực tế ra file để CoreService biết đúng port
  const portFile = path.join(__dirname, '..', 'ipc_port.txt');
  fs.writeFileSync(portFile, availablePort.toString());
  console.log(`\x1b[32m[Port File]\x1b[0m Đã ghi port ${availablePort} vào ipc_port.txt`);

  // Mặc định bind 0.0.0.0 để cho phép truy cập từ xa
  // Đặt HOST=127.0.0.1 nếu chỉ muốn truy cập local
  const host = process.env.HOST || '0.0.0.0';
  const spawnArgs = ['next', 'dev', '-p', availablePort.toString(), '--webpack'];
  spawnArgs.push('-H', host);
  console.log(`\x1b[32m[Host Bind]\x1b[0m Binding to ${host}`);

  // Spawn Next.js dev on the available port
  const nextProcess = spawn('npx', spawnArgs, {
    stdio: 'inherit',
    shell: true
  });

  nextProcess.on('error', (err) => {
    console.error('Lỗi khi khởi chạy Next.js dev server:', err);
  });
}

main();
