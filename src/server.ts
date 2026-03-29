import express from 'express';
import path from 'path';
import rateLimit from 'express-rate-limit';
import apiRouter from './routes/api';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const USE_SVELTE_UI = process.env.USE_SVELTE_UI === 'true';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use(express.json());

if (USE_SVELTE_UI) {
  app.use(express.static(path.join(__dirname, 'client')));
} else {
  app.use(express.static(path.join(__dirname, '..', 'src', 'public')));
}

app.use('/api', apiRouter);

app.get('*', (_req, res) => {
  if (USE_SVELTE_UI) {
    res.sendFile(path.join(__dirname, 'client', 'index.html'));
  } else {
    res.sendFile(path.join(__dirname, '..', 'src', 'public', 'index.html'));
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Pinpoint server running on http://localhost:${PORT}`);
  });
}

export default app;
