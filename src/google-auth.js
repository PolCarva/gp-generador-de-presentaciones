import { google } from 'googleapis';

/**
 * Crea un cliente autenticado de Google usando Service Account.
 * Lee las credenciales de la variable de entorno GOOGLE_SERVICE_ACCOUNT_KEY.
 */
export function getAuthClient() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!keyJson) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY no está configurada. ' +
      'Configura la variable de entorno con el JSON de la Service Account.'
    );
  }

  let credentials;
  try {
    credentials = JSON.parse(keyJson);
  } catch {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY no contiene JSON válido.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/presentations',
      'https://www.googleapis.com/auth/drive',
    ],
  });

  return auth;
}

/**
 * Retorna instancia de Google Slides API.
 */
export function getSlidesService() {
  const auth = getAuthClient();
  return google.slides({ version: 'v1', auth });
}

/**
 * Retorna instancia de Google Drive API.
 */
export function getDriveService() {
  const auth = getAuthClient();
  return google.drive({ version: 'v3', auth });
}
