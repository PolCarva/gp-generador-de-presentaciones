/**
 * Módulo de cálculos de pricing para cada módulo de la presentación.
 */

const SEARCH_PRICING = {
  text: 0.001,
  image: 0.002,
};

const EMAIL_PRICE_PER_UNIT = 0.0008;

/** USD por hora de soporte (hosting / SaaS) */
export const SUPPORT_PRICE_PER_HOUR = 40;

const SESSION_TIERS = [
  { min: 3_000_000, max: Infinity, price: 0.0010, label: '3M+' },
  { min: 1_000_000, max: 2_999_999, price: 0.0015, label: '1M - 2.999M' },
  { min: 500_000, max: 999_999, price: 0.0020, label: '500k - 999k' },
  { min: 200_000, max: 499_999, price: 0.0025, label: '200k - 499k' },
];

/**
 * Calcula el costo mensual de búsquedas.
 * Suposición: 100% text search a menos que se indique lo contrario.
 */
export function calculateSearch(searches, textPercentage = 100) {
  const textRatio = textPercentage / 100;
  const imageRatio = 1 - textRatio;

  const textCost = searches * textRatio * SEARCH_PRICING.text;
  const imageCost = searches * imageRatio * SEARCH_PRICING.image;
  const monthlyCost = textCost + imageCost;

  return {
    searches,
    textPercentage,
    textCost: round2(textCost),
    imageCost: round2(imageCost),
    monthlyCost: round2(monthlyCost),
  };
}

/**
 * Calcula el costo mensual de emails.
 */
export function calculateEmail(emails) {
  const monthlyCost = emails * EMAIL_PRICE_PER_UNIT;

  return {
    emails,
    pricePerUnit: EMAIL_PRICE_PER_UNIT,
    monthlyCost: round2(monthlyCost),
  };
}

/**
 * Calcula el costo mensual de sesiones según tier.
 */
export function calculateSessions(sessions) {
  const tier = SESSION_TIERS.find(
    (t) => sessions >= t.min && sessions <= t.max
  );

  if (!tier) {
    // Sesiones por debajo de 200k: usar el tier más bajo disponible
    const fallbackTier = SESSION_TIERS[SESSION_TIERS.length - 1];
    const monthlyCost = sessions * fallbackTier.price;
    return {
      sessions,
      tier: `< 200k`,
      pricePerSession: fallbackTier.price,
      monthlyCost: round2(monthlyCost),
    };
  }

  const monthlyCost = sessions * tier.price;

  return {
    sessions,
    tier: tier.label,
    pricePerSession: tier.price,
    monthlyCost: round2(monthlyCost),
  };
}

/**
 * Calcula el costo total mensual sumando todos los módulos activos.
 */
export function calculateTotal(inputs) {
  const result = {
    search: null,
    email: null,
    sessions: null,
    support: null,
    total: 0,
  };

  if (inputs.searches != null && inputs.searches > 0) {
    result.search = calculateSearch(inputs.searches, inputs.textPercentage);
    result.total += result.search.monthlyCost;
  }

  if (inputs.emails != null && inputs.emails > 0) {
    result.email = calculateEmail(inputs.emails);
    result.total += result.email.monthlyCost;
  }

  if (inputs.sessions != null && inputs.sessions > 0) {
    result.sessions = calculateSessions(inputs.sessions);
    result.total += result.sessions.monthlyCost;
  }

  if (inputs.support_hours != null && inputs.support_hours > 0) {
    const hours = inputs.support_hours;
    result.support = {
      hours,
      pricePerHour: SUPPORT_PRICE_PER_HOUR,
      monthlyCost: round2(hours * SUPPORT_PRICE_PER_HOUR),
    };
    result.total += result.support.monthlyCost;
  }

  result.total = round2(result.total);

  return result;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

export function formatUSD(amount) {
  return `USD ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
