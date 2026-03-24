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

/**
 * Genera una presentación a partir del template y los inputs del usuario.
 *
 * @param {Object} inputs - { searches, emails, sessions, support_hours, textPercentage }
 * @returns {Object} JSON estructurado con resultado
 */
export async function generatePresentation(inputs) {
  const drive = getDriveService();
  const slides = getSlidesService();

  // 1. Duplicar la presentación template
  const copyResponse = await drive.files.copy({
    fileId: TEMPLATE_ID,
    requestBody: {
      name: `Propuesta Comercial - ${new Date().toLocaleDateString('es-AR')}`,
    },
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

  for (const slide of slideClassification) {
    if (slide.module === 'total') {
      // El slide total siempre se mantiene si hay al menos un módulo activo
      if (activeModules.size > 0) {
        slidesToModify.push(slide);
      } else {
        slidesToDelete.push(slide);
      }
    } else if (slide.module && !activeModules.has(slide.module)) {
      // Si el módulo NO está activo, eliminar el slide
      slidesToDelete.push(slide);
    } else if (slide.module && activeModules.has(slide.module)) {
      // Si el módulo está activo, modificar el slide
      slidesToModify.push(slide);
    }
    // Slides sin módulo identificado (intro, etc.) se mantienen sin cambios
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

  // 7b. Reemplazar textos dinámicos
  const textReplacements = buildTextReplacements(inputs, calculations);
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

  // 8. Ejecutar batch update
  if (requests.length > 0) {
    await slides.presentations.batchUpdate({
      presentationId,
      requestBody: { requests },
    });
  }

  // 9. Hacer la presentación accesible
  await drive.permissions.create({
    fileId: presentationId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  // 10. Construir resultado
  const result = {
    presentationId,
    presentationUrl: `https://docs.google.com/presentation/d/${presentationId}/edit`,
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
    ],
  };

  return result;
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
 * Extrae todo el texto de un slide.
 */
function extractAllText(slide) {
  const texts = [];

  if (slide.pageElements) {
    for (const element of slide.pageElements) {
      if (element.shape && element.shape.text) {
        for (const textElement of element.shape.text.textElements || []) {
          if (textElement.textRun && textElement.textRun.content) {
            texts.push(textElement.textRun.content);
          }
        }
      }
      // Tablas
      if (element.table) {
        for (const row of element.table.tableRows || []) {
          for (const cell of row.tableCells || []) {
            if (cell.text) {
              for (const textElement of cell.text.textElements || []) {
                if (textElement.textRun && textElement.textRun.content) {
                  texts.push(textElement.textRun.content);
                }
              }
            }
          }
        }
      }
      // Grupos
      if (element.elementGroup && element.elementGroup.children) {
        for (const child of element.elementGroup.children) {
          if (child.shape && child.shape.text) {
            for (const textElement of child.shape.text.textElements || []) {
              if (textElement.textRun && textElement.textRun.content) {
                texts.push(textElement.textRun.content);
              }
            }
          }
        }
      }
    }
  }

  return texts.join(' ');
}

/**
 * Construye la lista de reemplazos de texto basados en los cálculos.
 * Usa placeholders que deben estar presentes en el template.
 */
function buildTextReplacements(inputs, calculations) {
  const replacements = [];

  // Search
  if (calculations.search) {
    replacements.push({
      find: '{{SEARCHES}}',
      replace: calculations.search.searches.toLocaleString('es-AR'),
    });
    replacements.push({
      find: '{{SEARCH_MONTHLY_COST}}',
      replace: formatUSD(calculations.search.monthlyCost),
    });
  }

  // Email
  if (calculations.email) {
    replacements.push({
      find: '{{EMAILS}}',
      replace: calculations.email.emails.toLocaleString('es-AR'),
    });
    replacements.push({
      find: '{{EMAIL_MONTHLY_COST}}',
      replace: formatUSD(calculations.email.monthlyCost),
    });
  }

  // Sessions
  if (calculations.sessions) {
    replacements.push({
      find: '{{SESSIONS}}',
      replace: calculations.sessions.sessions.toLocaleString('es-AR'),
    });
    replacements.push({
      find: '{{SESSION_TIER}}',
      replace: calculations.sessions.tier,
    });
    replacements.push({
      find: '{{SESSION_PRICE}}',
      replace: `USD ${calculations.sessions.pricePerSession}`,
    });
    replacements.push({
      find: '{{SESSION_MONTHLY_COST}}',
      replace: formatUSD(calculations.sessions.monthlyCost),
    });
  }

  // Support
  if (calculations.support) {
    replacements.push({
      find: '{{SUPPORT_HOURS}}',
      replace: calculations.support.hours.toString(),
    });
    replacements.push({
      find: '{{SUPPORT_MONTHLY_COST}}',
      replace: formatUSD(calculations.support.monthlyCost),
    });
  }

  // Total
  replacements.push({
    find: '{{TOTAL_MONTHLY_COST}}',
    replace: formatUSD(calculations.total),
  });

  return replacements;
}
