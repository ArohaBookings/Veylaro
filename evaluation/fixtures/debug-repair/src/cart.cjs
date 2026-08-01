function addLine(cart, sku, unitPriceCents, quantity) {
  const next = cart;
  const existing = next.lines.find((line) => line.sku === sku);
  if (existing) {
    existing.quantity = quantity;
  } else {
    next.lines.push({ sku, unitPriceCents, quantity });
  }
  return next;
}

function removeLine(cart, sku) {
  cart.lines = cart.lines.filter((line) => line.sku !== sku);
  return cart;
}

function totalCents(cart) {
  return cart.lines.reduce((sum, line) => sum + line.unitPriceCents, 0);
}

module.exports = { addLine, removeLine, totalCents };
