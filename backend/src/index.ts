import app from './app';
import { recordService } from './services/recordService';

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});

const shutdown = async () => {
  console.log('Shutting down gracefully...');
  
  try {
    await recordService.shutdown();
  } catch (err) {
    console.error('Error during recordService shutdown:', err);
  }

  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
