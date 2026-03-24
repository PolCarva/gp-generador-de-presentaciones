import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generatePresentation } from './slides-generator.js';
import { calculateTotal } from './calculations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

/**
 * POST /api/generate
 * Genera una presentación basada en los inputs del usuario.
 *
 * Body: { searches?, emails?, sessions?, support_hours?, textPercentage? }
 */
app.post('/api/generate', async (req, res) => {
  try {
    const { searches, emails, sessions, support_hours, textPercentage } = req.body;

    // Validar que al menos un input esté presente
    const hasInput =
      (searches != null && searches > 0) ||
      (emails != null && emails > 0) ||
      (sessions != null && sessions > 0) ||
      (support_hours != null && support_hours > 0);

    if (!hasInput) {
      return res.status(400).json({
        error: 'Se requiere al menos un input: searches, emails, sessions o support_hours.',
      });
    }

    // Validar tipos numéricos
    const inputs = {};
    if (searches != null) {
      const val = Number(searches);
      if (isNaN(val) || val < 0) {
        return res.status(400).json({ error: 'searches debe ser un número positivo.' });
      }
      inputs.searches = val;
    }
    if (emails != null) {
      const val = Number(emails);
      if (isNaN(val) || val < 0) {
        return res.status(400).json({ error: 'emails debe ser un número positivo.' });
      }
      inputs.emails = val;
    }
    if (sessions != null) {
      const val = Number(sessions);
      if (isNaN(val) || val < 0) {
        return res.status(400).json({ error: 'sessions debe ser un número positivo.' });
      }
      inputs.sessions = val;
    }
    if (support_hours != null) {
      const val = Number(support_hours);
      if (isNaN(val) || val < 0) {
        return res.status(400).json({ error: 'support_hours debe ser un número positivo.' });
      }
      inputs.support_hours = val;
    }
    if (textPercentage != null) {
      const val = Number(textPercentage);
      if (isNaN(val) || val < 0 || val > 100) {
        return res.status(400).json({ error: 'textPercentage debe ser entre 0 y 100.' });
      }
      inputs.textPercentage = val;
    }

    const result = await generatePresentation(inputs);
    res.json(result);
  } catch (error) {
    console.error('Error generando presentación:', error);

    if (error.message.includes('GOOGLE_SERVICE_ACCOUNT_KEY')) {
      return res.status(500).json({
        error: 'Google Service Account no configurada.',
        details: error.message,
      });
    }

    res.status(500).json({
      error: 'Error interno al generar la presentación.',
      details: error.message,
    });
  }
});

/**
 * POST /api/preview
 * Calcula los costos sin generar la presentación (preview).
 */
app.post('/api/preview', (req, res) => {
  try {
    const { searches, emails, sessions, support_hours, textPercentage } = req.body;

    const inputs = {};
    if (searches != null && Number(searches) > 0) inputs.searches = Number(searches);
    if (emails != null && Number(emails) > 0) inputs.emails = Number(emails);
    if (sessions != null && Number(sessions) > 0) inputs.sessions = Number(sessions);
    if (support_hours != null && Number(support_hours) > 0) inputs.support_hours = Number(support_hours);
    if (textPercentage != null) inputs.textPercentage = Number(textPercentage);

    const calculations = calculateTotal(inputs);
    res.json(calculations);
  } catch (error) {
    console.error('Error en preview:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});
