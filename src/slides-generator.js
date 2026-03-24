import { Readable } from 'stream';
import sizeOf from 'image-size';
import { getSlidesService, getDriveService } from './google-auth.js';
import { calculateTotal, formatUSD } from './calculations.js';

const TEMPLATE_ID = '1PcyROTOL0S4-GAt6gKahBoUxDqtgFjVoW1fA3LG7oDw';

/**
 * Mapeo de módulos a identificadores de slide.
 * Estos objectId se obtienen del template y deben coincidir con los slides reales.
 * Se actualizan dinámicamente al leer la presentación copiada.
 */
const MODULE_KEYWORDS = {
  search: ['gosearch', 'búsquedas', 'busquedas', 'search', 'text search', 'image search'],
  email: ['email', 'emails', 'correo', 'correos'],
  sessions: ['sesiones', 'sessions', 'session'],
  support: ['soporte', 'support'],
  total: ['total', 'inversión mensual total', 'inversion mensual total'],
};

/** Placeholders a borrar si el módulo no está contratado (replace con vacío) */
const PLACEHOLDERS_BY_MODULE = {
  search: [
    '{{search}}',
    '{{SEARCH}}',
    '{{SEARCHES}}',
    '{{busquedas}}',
    '{{búsquedas}}',
    '{{searchTotal}}',
    '{{SEARCH_TOTAL}}',
    '{{SEARCH_MONTHLY_COST}}',
    '{{totalBúsquedas}}',
    '{{totalBusquedas}}',
  ],
  email: [
    '{{email}}',
    '{{EMAIL}}',
    '{{EMAILS}}',
    '{{emails}}',
    '{{correos}}',
    '{{emailTotal}}',
    '{{EMAIL_TOTAL}}',
    '{{EMAIL_MONTHLY_COST}}',
    '{{totalCorreos}}',
    '{{totalEmails}}',
  ],
  sessions: [
    '{{sesiones}}',
    '{{SESIONES}}',
    '{{SESSIONS}}',
    '{{sessions}}',
    '{{sesionesTotal}}',
    '{{SESIONES_TOTAL}}',
    '{{SESSION_MONTHLY_COST}}',
    '{{totalSesiones}}',
    '{{SESSION_TIER}}',
    '{{SESSION_PRICE}}',
    '{{precioSesion}}',
  ],
  support: [
    '{{horas}}',
    '{{HORAS}}',
    '{{horasTotal}}',
    '{{HORAS_TOTAL}}',
    '{{SUPPORT_HOURS}}',
    '{{support_hours}}',
    '{{SUPPORT_MONTHLY_COST}}',
    '{{totalSoporte}}',
    '{{costoSoporte}}',
  ],
};

function getModulesFromPlaceholderText(text) {
  const modules = new Set();
  if (!text) return modules;
  const checks = [
    { re: /\{\{[^}]*sesiones[^}]*\}\}/i, m: 'sessions' },
    { re: /\{\{[^}]*sessions[^}]*\}\}/i, m: 'sessions' },
    { re: /\{\{[^}]*search[^}]*\}\}/i, m: 'search' },
    { re: /\{\{[^}]*busquedas[^}]*\}\}/i, m: 'search' },
    { re: /\{\{[^}]*búsquedas[^}]*\}\}/i, m: 'search' },
    { re: /\{\{[^}]*email[^}]*\}\}/i, m: 'email' },
    { re: /\{\{[^}]*correos[^}]*\}\}/i, m: 'email' },
    { re: /\{\{[^}]*horas[^}]*\}\}/i, m: 'support' },
    { re: /\{\{[^}]*soporte[^}]*\}\}/i, m: 'support' },
    { re: /\{\{[^}]*support[^}]*\}\}/i, m: 'support' },
  ];
  for (const { re, m } of checks) {
    if (re.test(text)) modules.add(m);
  }
  return modules;
}

function dimensionToEmu(d) {
  if (!d || d.magnitude == null) return 0;
  const m = Number(d.magnitude);
  if (d.unit === 'PT') return m * 12700;
  return m;
}

function translateToEmu(val, unit) {
  if (val == null) return 0;
  if (typeof val === 'number') return unit === 'PT' ? val * 12700 : val;
  if (typeof val === 'object' && val.magnitude != null) return dimensionToEmu(val);
  return 0;
}

function emuToDimension(magnitudeEmu, unit) {
  if (unit === 'PT') return { magnitude: magnitudeEmu / 12700, unit: 'PT' };
  return { magnitude: magnitudeEmu, unit: 'EMU' };
}

/** Escala la imagen tipo object-fit: contain dentro de la caja del placeholder */
function computeContainImageLayout(size, transform, imgW, imgH) {
  const wEmu = dimensionToEmu(size.width);
  const hEmu = dimensionToEmu(size.height);
  const u = transform?.unit || 'EMU';
  const tx = translateToEmu(transform?.translateX, u);
  const ty = translateToEmu(transform?.translateY, u);
  const fit = Math.min(wEmu / imgW, hEmu / imgH);
  const newWEmu = imgW * fit;
  const newHEmu = imgH * fit;
  const offX = (wEmu - newWEmu) / 2;
  const offY = (hEmu - newHEmu) / 2;
  const wUnit = size.width?.unit || 'EMU';
  const hUnit = size.height?.unit || 'EMU';
  return {
    size: {
      width: emuToDimension(newWEmu, wUnit),
      height: emuToDimension(newHEmu, hUnit),
    },
    transform: {
      scaleX: transform?.scaleX ?? 1,
      scaleY: transform?.scaleY ?? 1,
      shearX: transform?.shearX ?? 0,
      shearY: transform?.shearY ?? 0,
      translateX: tx + offX,
      translateY: ty + offY,
      unit: u,
    },
  };
}

/**
 * Genera una presentación a partir del template y los inputs del usuario.
 *
 * @param {Object} inputs - { nombreCliente?, searches, emails, sessions, support_hours, textPercentage, resumenEjecutivo? }
 * @param {Object} [options] - { logoBuffer?, logoMimeType? }
 * @returns {Object} JSON estructurado con resultado
 */
export async function generatePresentation(inputs, options = {}) {
  const { logoBuffer, logoMimeType } = options;
  const drive = getDriveService();
  const slides = getSlidesService();

  // 1. Duplicar la presentación template
  // DRIVE_COPY_PARENT_ID = ID de una carpeta (Shared Drive con cuota). No uses el ID del template (es un archivo).
  const copyParent = process.env.DRIVE_COPY_PARENT_ID?.trim();
  if (copyParent && copyParent === TEMPLATE_ID) {
    throw new Error(
      'DRIVE_COPY_PARENT_ID es el mismo que el template: debe ser una carpeta de Drive (URL …/folders/ID), no la presentación.'
    );
  }
  if (copyParent) {
    const folderMeta = await drive.files.get({
      fileId: copyParent,
      fields: 'mimeType,driveId',
      supportsAllDrives: true,
    });
    if (folderMeta.data.mimeType !== 'application/vnd.google-apps.folder') {
      throw new Error(
        'DRIVE_COPY_PARENT_NOT_FOLDER: DRIVE_COPY_PARENT_ID debe ser una carpeta de Drive, no otro tipo de archivo.'
      );
    }
    if (!folderMeta.data.driveId) {
      throw new Error(
        'DRIVE_COPY_PARENT_NOT_SHARED_DRIVE: Esa carpeta está en "Mi unidad" de alguien, no en un Drive compartido (Shared Drive). ' +
          'Lo que crea la API lo posee la cuenta de servicio y sigue sin cuota. ' +
          'Crea la carpeta dentro de una unidad compartida de Google Workspace, añade la cuenta de servicio como miembro del equipo y usa ese ID en DRIVE_COPY_PARENT_ID.'
      );
    }
  }
  const dateStr = new Date().toLocaleDateString('es-AR');
  const client = inputs.nombreCliente?.trim();
  const presentationTitle = client
    ? `Propuesta - ${client} - ${dateStr}`
    : `Propuesta Comercial - ${dateStr}`;

  const copyResponse = await drive.files.copy({
    fileId: TEMPLATE_ID,
    requestBody: {
      name: presentationTitle,
      ...(copyParent ? { parents: [copyParent] } : {}),
    },
    supportsAllDrives: true,
    fields: 'id',
  });

  const presentationId = copyResponse.data.id;

  // 2. Leer la presentación copiada para obtener estructura de slides
  const presentation = await slides.presentations.get({
    presentationId,
  });

  const slidesList = presentation.data.slides;

  // 3. Calcular pricing
  const calculations = calculateTotal(inputs);

  // 4. Determinar qué módulos están activos
  const activeModules = new Set();
  if (inputs.searches != null && inputs.searches > 0) activeModules.add('search');
  if (inputs.emails != null && inputs.emails > 0) activeModules.add('email');
  if (inputs.sessions != null && inputs.sessions > 0) activeModules.add('sessions');
  if (inputs.support_hours != null && inputs.support_hours > 0) activeModules.add('support');

  // 5. Clasificar cada slide
  const slideClassification = classifySlides(slidesList);

  // 6. Determinar slides a eliminar y slides a modificar
  const slidesToDelete = [];
  const slidesToModify = [];

  for (const slideMeta of slideClassification) {
    const fullSlide = slidesList.find((s) => s.objectId === slideMeta.objectId);
    const fullText = fullSlide ? extractAllText(fullSlide) : '';
    const placeholderModules = getModulesFromPlaceholderText(fullText);
    const hasPh = placeholderModules.size > 0;

    if (slideMeta.module === 'total') {
      if (activeModules.size > 0) {
        slidesToModify.push(slideMeta);
      } else {
        slidesToDelete.push(slideMeta);
      }
    } else if (hasPh) {
      const allPlaceholdersInactive = [...placeholderModules].every((m) => !activeModules.has(m));
      if (allPlaceholdersInactive) {
        slidesToDelete.push(slideMeta);
      } else {
        slidesToModify.push(slideMeta);
      }
    } else if (slideMeta.module && !activeModules.has(slideMeta.module)) {
      slidesToDelete.push(slideMeta);
    } else if (slideMeta.module && activeModules.has(slideMeta.module)) {
      slidesToModify.push(slideMeta);
    }
  }

  // 7. Construir requests de API
  const requests = [];

  // 7a. Eliminar slides que no aplican (en orden inverso para no afectar índices)
  for (const slide of slidesToDelete) {
    requests.push({
      deleteObject: {
        objectId: slide.objectId,
      },
    });
  }

  // 7b. Reemplazar textos dinámicos (+ vaciar placeholders de módulos no contratados)
  const textReplacements = buildTextReplacements(inputs, calculations, activeModules);
  for (const replacement of textReplacements) {
    requests.push({
      replaceAllText: {
        containsText: {
          text: replacement.find,
          matchCase: false,
        },
        replaceText: replacement.replace,
      },
    });
  }

  // 7c. Logo: subir imagen y colocarla donde estaba {{img}} (misma caja de texto)
  let logoImageUrl = null;
  const imgPlacement = findImgPlaceholderPlacement(slidesList);
  if (logoBuffer && logoBuffer.length > 0 && imgPlacement) {
    const logosParent = copyParent ? await ensureLogosFolderId(drive, copyParent) : undefined;
    logoImageUrl = await uploadLogoToDriveAndGetUrl(
      drive,
      logoBuffer,
      logoMimeType,
      logosParent
    );
    let imageSize = imgPlacement.size;
    let imageTransform = imgPlacement.transform;
    try {
      const dim = sizeOf(logoBuffer);
      if (dim.width && dim.height) {
        const fit = computeContainImageLayout(imgPlacement.size, imgPlacement.transform, dim.width, dim.height);
        imageSize = fit.size;
        imageTransform = fit.transform;
      }
    } catch {
      // usar caja del placeholder sin recalcular
    }
    requests.push({
      replaceAllText: {
        containsText: { text: '{{img}}', matchCase: false },
        replaceText: '',
      },
    });
    requests.push({
      createImage: {
        url: logoImageUrl,
        elementProperties: {
          pageObjectId: imgPlacement.pageObjectId,
          size: imageSize,
          transform: imageTransform,
        },
      },
    });
  } else {
    requests.push({
      replaceAllText: {
        containsText: { text: '{{img}}', matchCase: false },
        replaceText: '',
      },
    });
  }

  // 8. Ejecutar batch update
  if (requests.length > 0) {
    await slides.presentations.batchUpdate({
      presentationId,
      requestBody: { requests },
    });
  }

  // 9. Enlace "cualquiera con el enlace" (requiere supportsAllDrives en archivos de unidad compartida)
  let linkSharingError = null;
  try {
    await drive.permissions.create({
      fileId: presentationId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
      supportsAllDrives: true,
      sendNotificationEmail: false,
    });
  } catch (permErr) {
    linkSharingError =
      permErr?.message ||
      permErr?.response?.data?.error?.message ||
      'No se pudo añadir permiso de enlace público.';
    console.warn('Permiso anyone (no cambió la edición de slides):', linkSharingError);
  }

  // 10. Construir resultado
  const result = {
    presentationId,
    presentationTitle,
    presentationUrl: `https://docs.google.com/presentation/d/${presentationId}/edit`,
    ...(linkSharingError ? { linkSharingWarning: linkSharingError } : {}),
    slides_modified: slidesToModify.map((s) => ({
      objectId: s.objectId,
      module: s.module,
      index: s.index,
    })),
    slides_deleted: slidesToDelete.map((s) => ({
      objectId: s.objectId,
      module: s.module,
      index: s.index,
    })),
    calculations: {
      search: calculations.search,
      email: calculations.email,
      sessions: calculations.sessions,
      support: calculations.support,
      total: calculations.total,
    },
    actions: [
      'duplicatePresentation',
      ...slidesToDelete.map(() => 'deleteObject'),
      ...textReplacements.map(() => 'replaceAllText'),
      ...(logoImageUrl ? ['uploadLogo', 'createImage'] : []),
    ],
  };

  return result;
}

const ALLOWED_LOGO_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/** Carpeta `logos` bajo DRIVE_COPY_PARENT_ID (misma unidad compartida que las propuestas). */
async function ensureLogosFolderId(drive, parentFolderId) {
  if (!parentFolderId) return undefined;
  const listed = await drive.files.list({
    q: `'${parentFolderId}' in parents and name = 'logos' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const existing = listed.data.files?.[0]?.id;
  if (existing) return existing;
  const created = await drive.files.create({
    requestBody: {
      name: 'logos',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return created.data.id;
}

async function uploadLogoToDriveAndGetUrl(drive, buffer, mimeType, parentFolderId) {
  const mt = ALLOWED_LOGO_MIMES.has(mimeType) ? mimeType : 'image/png';
  const ext =
    mt === 'image/png' ? 'png' : mt === 'image/jpeg' ? 'jpg' : mt === 'image/gif' ? 'gif' : 'webp';
  const created = await drive.files.create({
    requestBody: {
      name: `proposal-logo-${Date.now()}.${ext}`,
      ...(parentFolderId ? { parents: [parentFolderId] } : {}),
    },
    media: { mimeType: mt, body: Readable.from(buffer) },
    fields: 'id',
    supportsAllDrives: true,
  });
  const fileId = created.data.id;
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
    sendNotificationEmail: false,
  });
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

/** Busca una caja de texto que contenga {{img}} y devuelve posición para createImage */
function findImgPlaceholderPlacement(slidesList) {
  for (const slide of slidesList) {
    const hit = walkElementsForImgPlaceholder(slide.pageElements || [], slide.objectId);
    if (hit) return hit;
  }
  return null;
}

function walkElementsForImgPlaceholder(elements, pageObjectId) {
  for (const el of elements || []) {
    if (el.shape?.text) {
      const txt = extractShapePlainText(el.shape);
      if (txt.includes('{{img}}')) {
        return { pageObjectId, size: el.size, transform: el.transform };
      }
    }
    if (el.table?.tableRows) {
      for (const row of el.table.tableRows) {
        for (const cell of row.tableCells || []) {
          if (cell.text) {
            const txt = extractTextFromTextContent(cell.text);
            if (txt.includes('{{img}}')) {
              return { pageObjectId, size: el.size, transform: el.transform };
            }
          }
        }
      }
    }
    if (el.elementGroup?.children) {
      const inner = walkElementsForImgPlaceholder(el.elementGroup.children, pageObjectId);
      if (inner) return inner;
    }
  }
  return null;
}

function extractShapePlainText(shape) {
  const parts = [];
  for (const te of shape.text?.textElements || []) {
    if (te.textRun?.content) parts.push(te.textRun.content);
  }
  return parts.join('');
}

function extractTextFromTextContent(text) {
  const parts = [];
  for (const te of text.textElements || []) {
    if (te.textRun?.content) parts.push(te.textRun.content);
  }
  return parts.join('');
}

/**
 * Clasifica cada slide del template identificando a qué módulo pertenece.
 */
function classifySlides(slidesList) {
  return slidesList.map((slide, index) => {
    const allText = extractAllText(slide).toLowerCase();

    let module = null;

    for (const [mod, keywords] of Object.entries(MODULE_KEYWORDS)) {
      if (keywords.some((kw) => allText.includes(kw))) {
        module = mod;
        break;
      }
    }

    return {
      objectId: slide.objectId,
      index,
      module,
      textPreview: allText.substring(0, 100),
    };
  });
}

/**
 * Extrae todo el texto de un slide (incluye grupos anidados).
 */
function extractAllText(slide) {
  return collectTextFromPageElements(slide.pageElements || []).join(' ');
}

function collectTextFromPageElements(elements) {
  const texts = [];
  for (const element of elements || []) {
    if (element.shape?.text) {
      for (const textElement of element.shape.text.textElements || []) {
        if (textElement.textRun?.content) texts.push(textElement.textRun.content);
      }
    }
    if (element.table) {
      for (const row of element.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          if (cell.text) {
            for (const textElement of cell.text.textElements || []) {
              if (textElement.textRun?.content) texts.push(textElement.textRun.content);
            }
          }
        }
      }
    }
    if (element.elementGroup?.children) {
      texts.push(...collectTextFromPageElements(element.elementGroup.children));
    }
  }
  return texts;
}

/**
 * Construye la lista de reemplazos de texto basados en los cálculos.
 * Placeholders en inglés ({{SESSIONS}}) o español ({{sesiones}}); matchCase: false en la API.
 */
function buildTextReplacements(inputs, calculations, activeModules) {
  const replacements = [];

  const add = (findVariants, replace) => {
    for (const find of findVariants) {
      replacements.push({ find, replace });
    }
  };

  const resumen = inputs.resumenEjecutivo != null ? String(inputs.resumenEjecutivo).trim() : '';
  if (resumen) {
    add(['{{resumenEjecutivo}}', '{{RESUMEN_EJECUTIVO}}'], resumen);
  }

  if (calculations.search) {
    const n = calculations.search.searches.toLocaleString('es-AR');
    const cost = formatUSD(calculations.search.monthlyCost);
    add(
      [
        '{{search}}',
        '{{SEARCH}}',
        '{{SEARCHES}}',
        '{{busquedas}}',
        '{{búsquedas}}',
        '{{BUSQUEDAS}}',
        '{{BÚSQUEDAS}}',
      ],
      n
    );
    add(
      [
        '{{searchTotal}}',
        '{{SEARCH_TOTAL}}',
        '{{SEARCH_MONTHLY_COST}}',
        '{{totalBúsquedas}}',
        '{{totalBusquedas}}',
        '{{TOTAL_BUSQUEDAS}}',
        '{{costoBúsquedas}}',
        '{{costoBusquedas}}',
      ],
      cost
    );
  }

  if (calculations.email) {
    const n = calculations.email.emails.toLocaleString('es-AR');
    const cost = formatUSD(calculations.email.monthlyCost);
    add(
      ['{{email}}', '{{EMAIL}}', '{{EMAILS}}', '{{emails}}', '{{correos}}', '{{CORREOS}}'],
      n
    );
    add(
      [
        '{{emailTotal}}',
        '{{EMAIL_TOTAL}}',
        '{{EMAIL_MONTHLY_COST}}',
        '{{totalCorreos}}',
        '{{totalEmails}}',
        '{{TOTAL_CORREOS}}',
        '{{costoCorreos}}',
        '{{costoEmails}}',
      ],
      cost
    );
  }

  if (calculations.sessions) {
    const s = calculations.sessions;
    const n = s.sessions.toLocaleString('es-AR');
    const cost = formatUSD(s.monthlyCost);
    const priceStr = `USD ${s.pricePerSession}`;
    add(
      ['{{sesiones}}', '{{SESIONES}}', '{{SESSIONS}}', '{{sessions}}'],
      n
    );
    add(['{{SESSION_TIER}}', '{{tierSesiones}}', '{{nivelSesiones}}'], s.tier);
    add(['{{SESSION_PRICE}}', '{{precioSesion}}', '{{precioPorSesion}}'], priceStr);
    add(
      [
        '{{sesionesTotal}}',
        '{{SESIONES_TOTAL}}',
        '{{SESSION_MONTHLY_COST}}',
        '{{totalSesiones}}',
        '{{TOTAL_SESIONES}}',
        '{{costoSesiones}}',
        '{{montoSesiones}}',
      ],
      cost
    );
  }

  if (calculations.support) {
    const h = calculations.support.hours.toString();
    const cost = formatUSD(calculations.support.monthlyCost);
    add(
      [
        '{{horas}}',
        '{{HORAS}}',
        '{{SUPPORT_HOURS}}',
        '{{support_hours}}',
        '{{horasSoporte}}',
        '{{horas_soporte}}',
      ],
      h
    );
    add(
      [
        '{{horasTotal}}',
        '{{HORAS_TOTAL}}',
        '{{SUPPORT_MONTHLY_COST}}',
        '{{totalSoporte}}',
        '{{costoSoporte}}',
      ],
      cost
    );
  }

  add(
    [
      '{{TOTAL_MONTHLY_COST}}',
      '{{totalMensual}}',
      '{{TOTAL_MENSUAL}}',
      '{{inversionTotal}}',
      '{{inversiónTotal}}',
      '{{TOTAL}}',
    ],
    formatUSD(calculations.total)
  );

  if (!resumen) {
    add(['{{resumenEjecutivo}}', '{{RESUMEN_EJECUTIVO}}'], '');
  }

  for (const mod of ['search', 'email', 'sessions', 'support']) {
    if (!activeModules.has(mod)) {
      add(PLACEHOLDERS_BY_MODULE[mod], '');
    }
  }

  return replacements;
}
