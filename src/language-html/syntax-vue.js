import { group } from "../document/builders.js";
import { getUnescapedAttributeValue } from "./utils/index.js";
import isVueSfcWithTypescriptScript from "./utils/is-vue-sfc-with-typescript-script.js";

/**
 * @typedef {import("../document/builders.js").Doc} Doc
 */

/**
 *     v-for="... in ..."
 *     v-for="... of ..."
 *     v-for="(..., ...) in ..."
 *     v-for="(..., ...) of ..."
 *
 * @param {(code: string, opts: *) => Doc} attributeTextToDoc
 * @param {*} options
 * @returns {Promise<Doc>}
 */
async function printVueFor(path, attributeTextToDoc, options) {
  const value = getUnescapedAttributeValue(path.node);
  const { left, operator, right } = parseVueFor(value);
  const parseWithTs = isVueSfcWithTypescriptScript(path, options);
  return [
    group(
      await attributeTextToDoc(`function _(${left}) {}`, {
        parser: parseWithTs ? "babel-ts" : "babel",
        __isVueForBindingLeft: true,
      })
    ),
    " ",
    operator,
    " ",
    await attributeTextToDoc(right, {
      parser: parseWithTs ? "__ts_expression" : "__js_expression",
    }),
  ];
}

// modified from https://github.com/vuejs/vue/blob/v2.5.17/src/compiler/parser/index.js#L370-L387
function parseVueFor(value) {
  const forAliasRE = /(.*?)\s+(in|of)\s+(.*)/s;
  const forIteratorRE = /,([^,\]}]*)(?:,([^,\]}]*))?$/;
  const stripParensRE = /^\(|\)$/g;

  const inMatch = value.match(forAliasRE);
  if (!inMatch) {
    return;
  }

  const res = {};
  res.for = inMatch[3].trim();
  if (!res.for) {
    return;
  }

  const alias = inMatch[1].trim().replaceAll(stripParensRE, "");
  const iteratorMatch = alias.match(forIteratorRE);
  if (iteratorMatch) {
    res.alias = alias.replace(forIteratorRE, "");
    res.iterator1 = iteratorMatch[1].trim();
    if (iteratorMatch[2]) {
      res.iterator2 = iteratorMatch[2].trim();
    }
  } else {
    res.alias = alias;
  }

  const left = [res.alias, res.iterator1, res.iterator2];
  if (
    left.some(
      (part, index) =>
        !part && (index === 0 || left.slice(index + 1).some(Boolean))
    )
  ) {
    return;
  }

  return {
    left: left.filter(Boolean).join(","),
    operator: inMatch[2],
    right: res.for,
  };
}

/**
 * @param {(code: string, opts: *) => Doc} attributeTextToDoc
 * @param {*} options
 * @returns {Doc}
 */
function printVueBindings(path, attributeTextToDoc, options) {
  const value = getUnescapedAttributeValue(path.node);
  return attributeTextToDoc(`function _(${value}) {}`, {
    parser: isVueSfcWithTypescriptScript(path, options) ? "babel-ts" : "babel",
    __isVueBindings: true,
  });
}

function isVueEventBindingExpression(eventBindingValue) {
  // https://github.com/vuejs/vue/blob/v2.5.17/src/compiler/codegen/events.js#L3-L4
  // arrow function or anonymous function
  const fnExpRE = /^(?:[\w$]+|\([^)]*\))\s*=>|^function\s*\(/;
  // simple member expression chain (a, a.b, a['b'], a["b"], a[0], a[b])
  const simplePathRE =
    /^[$A-Z_a-z][\w$]*(?:\.[$A-Z_a-z][\w$]*|\['[^']*']|\["[^"]*"]|\[\d+]|\[[$A-Z_a-z][\w$]*])*$/;

  // https://github.com/vuejs/vue/blob/v2.5.17/src/compiler/helpers.js#L104
  const value = eventBindingValue.trim();

  return fnExpRE.test(value) || simplePathRE.test(value);
}

export { isVueEventBindingExpression, printVueFor, printVueBindings };
