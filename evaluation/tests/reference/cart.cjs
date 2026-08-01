function validCart(cart) {
  return cart && Array.isArray(cart.lines);
}

function validLine(line) {
  return line && typeof line.sku === "string" && line.sku.length > 0 && Number.isInteger(line.unitPriceCents) && line.unitPriceCents >= 0 && Number.isInteger(line.quantity) && line.quantity > 0;
}

function addLine(cart, sku, unitPriceCents, quantity) {
  const incoming = { sku, unitPriceCents, quantity };
  if (!validCart(cart) || !validLine(incoming)) throw new Error("Invalid line");
  const lines = cart.lines.map((line) => ({ ...line }));
  const index = lines.findIndex((line) => line.sku === sku);
  if (index >= 0) lines[index] = { ...lines[index], quantity: lines[index].quantity + quantity };
  else lines.push(incoming);
  return { ...cart, lines };
}

function removeLine(cart, sku) {
  if (!validCart(cart) || typeof sku !== "string" || !sku) throw new Error("Invalid cart");
  return { ...cart, lines: cart.lines.filter((line) => line.sku !== sku).map((line) => ({ ...line })) };
}

function totalCents(cart) {
  if (!validCart(cart) || !cart.lines.every(validLine)) throw new Error("Invalid cart");
  return cart.lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
}

module.exports = { addLine, removeLine, totalCents };
