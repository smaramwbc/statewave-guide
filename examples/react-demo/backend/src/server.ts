import express from 'express';
import { clientsRouter } from './routes/clients';

const app = express();
app.use(express.json());

/**
 * The mount prefix.
 *
 * A module-scope string literal, matching `API_BASE_URL` in the frontend's
 * `src/lib/api.ts`. That symmetry is what collapses the frontend's
 * `api.post('/clients')` and this router's `post('/clients')` onto one node.
 */
app.use('/api', clientsRouter);

const PORT = 3001;
app.listen(PORT);
