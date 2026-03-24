import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generatePresentation } from './slides-generator.js';
import { calculateTotal } from './calculations.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

function parseOptionalNumber(raw) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const val = Number(raw);
  if (isNaN(val)) return undefined;
  return val;
}

/**
 * POST /api/generate
 * JSON: { searches?, emails?, sessions?, support_hours?, textPercentage?, resumenEjecutivo? }
 * multipart (FormData): mismos campos + file field "logo" (png, jpeg, gif, webp)
 */
app.post(
  '/api/generate',
  (req, res, next) => {
    if (req.is('multipart/form-data')) {
      return upload.single('logo')(req, res, next);
    }
    next();
  },
  async (req, res) => {
  try {
    const b = req.body;
    const searches = parseOptionalNumber(b.searches);
    const emails = parseOptionalNumber(b.emails);
    const sessions = parseOptionalNumber(b.sessions);
    const support_hours = parseOptionalNumber(b.support_hours);
    const textPercentage = parseOptionalNumber(b.textPercentage);
    const resumenEjecutivo =
      b.resumenEjecutivo != null && String(b.resumenEjecutivo).trim() !== ''
        ? String(b.resumenEjecutivo)
        : undefined;
    const nombreCliente =
      b.nombreCliente != null && String(b.nombreCliente).trim() !== ''
        ? String(b.nombreCliente).trim()
        : undefined;

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

    const inputs = {};
    if (searches != null) {
      if (searches < 0) {
        return res.status(400).json({ error: 'searches debe ser un número positivo.' });
      }
      inputs.searches = searches;
    }
    if (emails != null) {
      if (emails < 0) {
        return res.status(400).json({ error: 'emails debe ser un número positivo.' });
      }
      inputs.emails = emails;
    }
    if (sessions != null) {
      if (sessions < 0) {
        return res.status(400).json({ error: 'sessions debe ser un número positivo.' });
      }
      inputs.sessions = sessions;
    }
    if (support_hours != null) {
      if (support_hours < 0) {
        return res.status(400).json({ error: 'support_hours debe ser un número positivo.' });
      }
      inputs.support_hours = support_hours;
    }
    if (textPercentage != null) {
      if (textPercentage < 0 || textPercentage > 100) {
        return res.status(400).json({ error: 'textPercentage debe ser entre 0 y 100.' });
      }
      inputs.textPercentage = textPercentage;
    }
    if (resumenEjecutivo !== undefined) {
      inputs.resumenEjecutivo = resumenEjecutivo;
    }
    if (nombreCliente !== undefined) {
      inputs.nombreCliente = nombreCliente;
    }

    const genOptions = {};
    if (req.file?.buffer?.length) {
      const mt = req.file.mimetype;
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mt)) {
        return res.status(400).json({ error: 'El logo debe ser PNG, JPEG, GIF o WebP.' });
      }
      genOptions.logoBuffer = req.file.buffer;
      genOptions.logoMimeType = mt;
    }

    const result = await generatePresentation(inputs, genOptions);
    res.json(result);
  } catch (error) {
    console.error('Error generando presentación:', error);

    if (error.message.includes('GOOGLE_SERVICE_ACCOUNT_KEY')) {
      return res.status(500).json({
        error: 'Google Service Account no configurada.',
        details: error.message,
      });
    }

    const apiReason =
      error?.response?.data?.error?.errors?.[0]?.reason ?? error?.errors?.[0]?.reason;
    if (apiReason === 'storageQuotaExceeded') {
      return res.status(507).json({
        error:
          'Cuota de Google Drive agotada para la cuenta de servicio. Compartir una carpeta desde "Mi unidad" no evita esto: los archivos nuevos los posee la service account.',
        hint:
          'Usa una carpeta dentro de un Drive compartido (Shared Drive) de Google Workspace, con la service account como miembro del equipo (no solo invitada a una carpeta). El ID debe ser de …/drive/folders/… dentro de esa unidad.',
        details: error?.response?.data?.error?.message,
      });
    }
    if (apiReason === 'parentNotAFolder') {
      return res.status(400).json({
        error:
          'DRIVE_COPY_PARENT_ID debe ser el ID de una carpeta de Drive (p. ej. URL …/folders/XXXXXXXX), no el ID de la presentación plantilla.',
        details: error?.response?.data?.error?.errors?.[0]?.message ?? error?.errors?.[0]?.message,
      });
    }

    if (error.message?.includes('DRIVE_COPY_PARENT_ID es el mismo que el template')) {
      return res.status(400).json({
        error: error.message,
        hint:
          'Abre una carpeta en Drive (nueva si hace falta) y usa el ID de la URL …/folders/ESTE_ID — no el ID de docs.google.com/presentation/d/…',
      });
    }

    if (error.message?.startsWith('DRIVE_COPY_PARENT_NOT_SHARED_DRIVE:')) {
      return res.status(400).json({
        error: error.message.replace(/^DRIVE_COPY_PARENT_NOT_SHARED_DRIVE:\s*/, ''),
        code: 'DRIVE_COPY_PARENT_NOT_SHARED_DRIVE',
      });
    }
    if (error.message?.startsWith('DRIVE_COPY_PARENT_NOT_FOLDER:')) {
      return res.status(400).json({
        error: error.message.replace(/^DRIVE_COPY_PARENT_NOT_FOLDER:\s*/, ''),
        code: 'DRIVE_COPY_PARENT_NOT_FOLDER',
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

const server = app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `El puerto ${PORT} ya está en uso. Cierra el otro proceso (p. ej. lsof -ti :${PORT} | xargs kill) o exporta PORT=8080.`
    );
    process.exit(1);
  }
  throw err;
});
