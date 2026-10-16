import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { paymentRouter } from './server/routes/paymentRoutes';
import { v1Router, handleCommonPay } from './server/routes/v1Routes';
import { startNotificationProcessor } from './server/services/notificationService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Common Payment Initiation URL (e.g. https://payments.aima.in/pay?source=AMIACRC&...)
app.get('/pay', handleCommonPay);

// Phase 1/2 API routes (preserved)
app.use('/api', paymentRouter);

// Phase 3 versioned API
app.use('/api/v1', v1Router);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), version: '3.0' });
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    // Serve static files from Vite build
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    // In development, mount Vite middleware mode
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AIMA Payment Hub v3.0 running on http://0.0.0.0:${PORT}`);
    console.log(`  Phase 1/2 API: /api/*`);
    console.log(`  Phase 3 v1 API: /api/v1/*`);
  });

  // Start Phase 3 background notification processor
  startNotificationProcessor();
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
