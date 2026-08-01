import assert from "node:assert/strict";
import test from "node:test";

import { orderTotal } from "../src/cart.js";

test("percentage coupons reduce the subtotal by that percentage", () => {
  assert.equal(orderTotal([{ price: 25, quantity: 2 }], { percent: 10 }), 45);
});

test("an absent coupon leaves the subtotal unchanged", () => {
  assert.equal(orderTotal([{ price: 7.5, quantity: 4 }]), 30);
});
