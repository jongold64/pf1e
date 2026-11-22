// Custom equipment (Equipment tab, Custom button): gear the list doesn't have, with its own name, price and weight.
// state.customGear = [{ id, name, price (gp each), weight (lbs. each), qty, free, notes }]. No page code here.

export const customGearCost = (list = []) => Math.round(list.reduce((n, g) => n + (g.free ? 0 : (g.price || 0) * (g.qty || 1)), 0) * 100) / 100;
export const customGearWeight = (list = []) => Math.round(list.reduce((n, g) => n + (g.weight || 0) * (g.qty || 1), 0) * 100) / 100;

// Saved items tidied: a name, prices and weights of 0 or more, quantities 1-999 (at most 100 items).
export function tidyCustomGear(saved) {
  const num = (v, max) => (Number.isFinite(v) && v >= 0 ? Math.min(max, Math.round(v * 100) / 100) : 0);
  return (Array.isArray(saved) ? saved : []).filter(g => g && typeof g === 'object').slice(0, 100).map((g, i) => ({
    id: typeof g.id === 'string' && g.id ? g.id.slice(0, 40) : `cgear-${i}`, name: String(g.name || 'Custom item').slice(0, 60),
    price: num(g.price, 1e7), weight: num(g.weight, 1e5), qty: Math.max(1, Math.min(999, Math.round(g.qty) || 1)),
    free: g.free === true, notes: String(g.notes || '').slice(0, 500),
  }));
}
