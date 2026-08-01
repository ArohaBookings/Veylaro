export function orderTotal(lines, coupon) {
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const discount = coupon?.percent ? coupon.percent : 0;
  return Number((subtotal - discount).toFixed(2));
}
