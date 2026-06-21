import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { geocodeAddress, getTransitRoute, hasAmapWebKey, searchPois } from './amapService.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5185;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, version: 'amap-geocode-fallback-v2', amapConfigured: hasAmapWebKey() });
});

app.get('/api/amap/geocode', async (request, response) => {
  try {
    const { address, city = '北京' } = request.query;
    if (!address) {
      response.status(400).json({ error: 'address is required' });
      return;
    }

    const result = await geocodeAddress({ address, city });
    if (!result) {
      response.status(404).json({ error: 'geocode not found' });
      return;
    }

    response.json(result);
  } catch (error) {
    response.status(503).json({ error: error.message });
  }
});

app.get('/api/amap/search-pois', async (request, response) => {
  try {
    const { category, city = '北京', location, radius = 5000 } = request.query;
    const result = await searchPois({ category, city, location, radius });

    if (result.length === 0) {
      response.status(404).json({ error: 'pois not found' });
      return;
    }

    response.json({ pois: result });
  } catch (error) {
    response.status(503).json({ error: error.message });
  }
});

app.get('/api/amap/route', async (request, response) => {
  try {
    const { origin, destination, city = '北京', mode = 'transit' } = request.query;
    if (!origin || !destination) {
      response.status(400).json({ error: 'origin and destination are required' });
      return;
    }

    const result = await getTransitRoute({ origin, destination, city, mode });
    if (!result) {
      response.json({ unavailable: true });
      return;
    }

    response.json(result);
  } catch (error) {
    response.status(503).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`MeetWe API server listening on http://127.0.0.1:${port}`);
});
