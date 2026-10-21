import 'dotenv/config';
import express, { Request, Response } from 'express';
import { paymentRouter } from '../server/routes/paymentRoutes';
import { v1Router, handleCommonPay } from '../server/routes/v1Routes';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Common Payment Initiation URL
app.get('/pay', handleCommonPay);
app.get('/api/pay', handleCommonPay);

// Phase 1/2 API routes
app.use('/api', paymentRouter);

// Phase 3 versioned API
app.use('/api/v1', v1Router);

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    platform: 'vercel-serverless',
    version: '3.0',
  });
});

export default app;
