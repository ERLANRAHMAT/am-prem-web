'use strict';

const app = require('./app');

const port = Number(process.env.PORT) || 3000;

const server = app.listen(port, () => {
  console.log(`[am-generator] berjalan di http://localhost:${port}`);
});

function shutdown(signal) {
  console.log(`[am-generator] menerima ${signal}, menutup server...`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
