import assert from "node:assert/strict";
import { APP_NAVIGATION, getRouteByPath } from "../src/lib/navigation/routes.js";

const primary = APP_NAVIGATION[0].items.map((item) => item.label);
assert.deepEqual(primary, ["Home", "My Financial Life", "Documents", "Action Plan", "Reports"]);
assert.equal(getRouteByPath("/my-financial-life").title, "My Financial Life");
assert.equal(getRouteByPath("/documents").title, "Documents");
assert.equal(getRouteByPath("/action-plan").title, "Action Plan");
assert.equal(getRouteByPath("/insurance/existing-policy-id").title, "Policy Detail");

console.log("PASS simplified navigation preserves legacy policy routing");
