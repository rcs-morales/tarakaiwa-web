/**
 * querySelector for tests, loosely typed so assertions can read element
 * properties (`.value`, `.checked`, `.src`, `.style` …) without a cast.
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {any} the first match, or null
 */
export function q(root, selector) {
  return root.querySelector(selector);
}
