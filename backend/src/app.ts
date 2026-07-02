import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import routes from './routes';
import { errorHandler } from './middlewares/errorHandler';

const app = express();

app.use(cors());
app.use(express.json());

import path from 'path';
app.use('/hls', express.static(path.join(__dirname, '../public/hls')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: "ok" });
});

// API Routes
app.use('/api', routes);

// 404 Fallback Handler
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Global Error Handler
app.use(errorHandler);

export default app;
