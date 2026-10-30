import 'dotenv/config';
import express, { Request, Response } from 'express';
import { paymentRouter } from './routes/paymentRoutes';
import { v1Router, handleCommonPay } from './routes/v1Routes';

// Default sandbox test credentials if running on serverless without injected .env
if (process.env.WORLDLINE_ENVIRONMENT !== 'production') {
  if (!process.env.WORLDLINE_MERCHANT_CODE) {
    process.env.WORLDLINE_MERCHANT_CODE = 'T1202993';
  }
  if (!process.env.WORLDLINE_SALT) {
    process.env.WORLDLINE_SALT = process.env.WORLDLINE_MERCHANT_CODE === 'T945221'
      ? '5174857326WJPKBR'
      : '5367530737NPUJCA';
  }
  if (!process.env.WORLDLINE_SCHEME_CODE) {
    process.env.WORLDLINE_SCHEME_CODE = 'FIRST';
  }
  if (!process.env.WORLDLINE_ENVIRONMENT) {
    process.env.WORLDLINE_ENVIRONMENT = 'sandbox';
  }
}

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Common Payment Initiation URL
app.get(['/pay', '/api/pay'], handleCommonPay);

// When Vercel rewrites /pay to /api with query parameters
app.get('/api', (req: Request, res: Response, next) => {
  if (req.query.source || req.query.app || req.query.project_code) {
    return handleCommonPay(req, res);
  }
  return res.json({
    status: 'ok',
    service: 'AIMA Centralized Payment Hub API',
    time: new Date().toISOString(),
  });
});

// Phase 1/2 API routes
app.use(['/api', '/'], paymentRouter);

// Phase 3 versioned API
app.use(['/api/v1', '/v1'], v1Router);

// Health check endpoint
app.get(['/health', '/api/health'], (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    platform: 'vercel-serverless',
    version: '3.1',
  });
});

export default function handler(req: any, res: any) {
  return app(req, res);
}
