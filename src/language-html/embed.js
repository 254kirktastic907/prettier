import {
  breakParent,
  group,
  hardline,
  indent,
  line,
  fill,
  softline,
} from "../document/builders.js";
import { mapDoc, replaceEndOfLine } from "../document/utils.js";
import printFrontMatter from "../utils/front-matter/print.js";
import {
  printClosingTag,
  printClosingTagSuffix,
  needsToBorrowPrevClosingTagEndMarker,
  printOpeningTagPrefix,
  printOpeningTag,
} from "./print/tag.js";
import { printImgSrcset, printClassNames } from "./syntax-attribute.js";
import {
  printVueFor,
  printVueBindings,
  isVueEventBindingExpression,
} from "./syntax-vue.js";
import {
  isScriptLikeTag,
  isVueNonHtmlBlock,
  inferElementParser,
  htmlTrimPreserveIndentation,
  dedentString,
  isVueSlotAttribute,
  isVueSfcBindingsAttribute,
  getTextValueParts,
  getUnescapedAttributeValue,
} from "./utils/index.js";
import isVueSfcWithTypescriptScript from "./utils/is-vue-sfc-with-typescript-script.js";
import getNodeContent from "./get-node-content.js";

async function printEmbeddedAttributeValue(path, htmlTextToDoc, options) {
  const { node } = path;
  const isKeyMatched = (patterns) =>
    new RegExp(patterns.join("|")).test(node.fullName);

  let shouldHug = false;

  const __onHtmlBindingRoot = (root, options) => {
    const rootNode =
      root.type === "NGRoot"
        ? root.node.type === "NGMicrosyntax" &&
          root.node.body.length === 1 &&
          root.node.body[0].type === "NGMicrosyntaxExpression"
          ? root.node.body[0].expression
          : root.node
        : root.type === "JsExpressionRoot"
        ? root.node
        : root;
    if (
      rootNode &&
      (rootNode.type === "ObjectExpression" ||
        rootNode.type === "ArrayExpression" ||
        ((options.parser === "__vue_expression" ||
          options.parser === "__vue_ts_expression") &&
          (rootNode.type === "TemplateLiteral" ||
            rootNode.type === "StringLiteral")))
    ) {
      shouldHug = true;
    }
  };

  const printHug = (doc) => group(doc);
  const printExpand = (doc, canHaveTrailingWhitespace = true) =>
    group([indent([softline, doc]), canHaveTrailingWhitespace ? softline : ""]);
  const printMaybeHug = (doc) => (shouldHug ? printHug(doc) : printExpand(doc));

  const attributeTextToDoc = (code, opts) =>
    htmlTextToDoc(code, {
      __onHtmlBindingRoot,
      __embeddedInHtml: true,
      ...opts,
    });
  const value = getUnescapedAttributeValue(node);

  if (
    node.fullName === "srcset" &&
    (node.parent.fullName === "img" || node.parent.fullName === "source")
  ) {
    return printExpand(printImgSrcset(value));
  }

  if (
    node.fullName === "class" &&
    !options.parentParser &&
    !value.includes("{{")
  ) {
    return printClassNames(value);
  }

  if (
    node.fullName === "style" &&
    !options.parentParser &&
    !value.includes("{{")
  ) {
    return printExpand(
      await attributeTextToDoc(value, {
        parser: "css",
        __isHTMLStyleAttribute: true,
      })
    );
  }

  if (options.parser === "vue") {
    if (node.fullName === "v-for") {
      return printVueFor(path, attributeTextToDoc, options);
    }

    if (isVueSlotAttribute(node) || isVueSfcBindingsAttribute(node, options)) {
      return printVueBindings(path, attributeTextToDoc, options);
    }

    /**
     *     @click="jsStatement"
     *     @click="jsExpression"
     *     v-on:click="jsStatement"
     *     v-on:click="jsExpression"
     */
    const vueEventBindingPatterns = ["^@", "^v-on:"];
    /**
     *     :class="vueExpression"
     *     v-bind:id="vueExpression"
     */
    const vueExpressionBindingPatterns = ["^:", "^v-bind:"];
    /**
     *     v-if="jsExpression"
     */
    const jsExpressionBindingPatterns = ["^v-"];

    if (isKeyMatched(vueEventBindingPatterns)) {
      const parser = isVueEventBindingExpression(value)
        ? isVueSfcWithTypescriptScript(path, options)
          ? "__ts_expression"
          : "__js_expression"
        : isVueSfcWithTypescriptScript(path, options)
        ? "__vue_ts_event_binding"
        : "__vue_event_binding";
      return printMaybeHug(await attributeTextToDoc(value, { parser }));
    }

    if (isKeyMatched(vueExpressionBindingPatterns)) {
      return printMaybeHug(
        await attributeTextToDoc(value, {
          parser: isVueSfcWithTypescriptScript(path, options)
            ? "__vue_ts_expression"
            : "__vue_expression",
        })
      );
    }

    if (isKeyMatched(jsExpressionBindingPatterns)) {
      return printMaybeHug(
        await attributeTextToDoc(value, {
          parser: isVueSfcWithTypescriptScript(path, options)
            ? "__ts_expression"
            : "__js_expression",
        })
      );
    }
  }

  if (options.parser === "angular") {
    const ngTextToDoc = (code, opts) =>
      // angular does not allow trailing comma
      attributeTextToDoc(code, { ...opts, trailingComma: "none" });

    /**
     *     *directive="angularDirective"
     */
    const ngDirectiveBindingPatterns = ["^\\*"];
    /**
     *     (click)="angularStatement"
     *     on-click="angularStatement"
     */
    const ngStatementBindingPatterns = ["^\\(.+\\)$", "^on-"];
    /**
     *     [target]="angularExpression"
     *     bind-target="angularExpression"
     *     [(target)]="angularExpression"
     *     bindon-target="angularExpression"
     */
    const ngExpressionBindingPatterns = [
      "^\\[.+\\]$",
      "^bind(on)?-",
      // Unofficial rudimentary support for some of the most used directives of AngularJS 1.x
      "^ng-(if|show|hide|class|style)$",
    ];
    /**
     *     i18n="longDescription"
     *     i18n-attr="longDescription"
     */
    const ngI18nPatterns = ["^i18n(-.+)?$"];

    if (isKeyMatched(ngStatementBindingPatterns)) {
      return printMaybeHug(await ngTextToDoc(value, { parser: "__ng_action" }));
    }

    if (isKeyMatched(ngExpressionBindingPatterns)) {
      return printMaybeHug(
        await ngTextToDoc(value, { parser: "__ng_binding" })
      );
    }

    if (isKeyMatched(ngI18nPatterns)) {
      return printExpand(
        fill(getTextValueParts(node, value.trim())),
        !value.includes("@@")
      );
    }

    if (isKeyMatched(ngDirectiveBindingPatterns)) {
      return printMaybeHug(
        await ngTextToDoc(value, { parser: "__ng_directive" })
      );
    }

    const interpolationRegex = /{{(.+?)}}/s;
    if (interpolationRegex.test(value)) {
      const parts = [];
      for (const [index, part] of value.split(interpolationRegex).entries()) {
        if (index % 2 === 0) {
          parts.push(replaceEndOfLine(part));
        } else {
          try {
            parts.push(
              group([
                "{{",
                indent([
                  line,
                  await ngTextToDoc(part, {
                    parser: "__ng_interpolation",
                    __isInHtmlInterpolation: true, // to avoid unexpected `}}`
                  }),
                ]),
                line,
                "}}",
              ])
            );
          } catch {
            parts.push("{{", replaceEndOfLine(part), "}}");
          }
        }
      }
      return group(parts);
    }
  }

  return null;
}

function embed(path, options) {
  const { node } = path;

  switch (node.type) {
    case "element":
      if (isScriptLikeTag(node) || node.type === "interpolation") {
        // Fall through to "text"
        return;
      }

      if (!node.isSelfClosing && isVueNonHtmlBlock(node, options)) {
        const parser = inferElementParser(node, options);
        if (!parser) {
          return;
        }

        return async (textToDoc, print) => {
          const content = getNodeContent(node, options);
          let isEmpty = /^\s*$/.test(content);
          let doc = "";
          if (!isEmpty) {
            doc = await textToDoc(htmlTrimPreserveIndentation(content), {
              parser,
              __embeddedInHtml: true,
            });
            isEmpty = doc === "";
          }

          return [
            printOpeningTagPrefix(node, options),
            group(printOpeningTag(path, options, print)),
            isEmpty ? "" : hardline,
            doc,
            isEmpty ? "" : hardline,
            printClosingTag(node, options),
            printClosingTagSuffix(node, options),
          ];
        };
      }
      break;

    case "text":
      if (isScriptLikeTag(node.parent)) {
        const parser = inferElementParser(node.parent, options);
        if (parser) {
          return async (textToDoc) => {
            const value =
              parser === "markdown"
                ? dedentString(node.value.replace(/^[^\S\n]*\n/, ""))
                : node.value;
            const textToDocOptions = { parser, __embeddedInHtml: true };
            if (options.parser === "html" && parser === "babel") {
              let sourceType = "script";
              const { attrMap } = node.parent;
              if (
                attrMap &&
                (attrMap.type === "module" ||
                  (attrMap.type === "text/babel" &&
                    attrMap["data-type"] === "module"))
              ) {
                sourceType = "module";
              }
              textToDocOptions.__babelSourceType = sourceType;
            }

            return [
              breakParent,
              printOpeningTagPrefix(node, options),
              await textToDoc(value, textToDocOptions, {
                stripTrailingHardline: true,
              }),
              printClosingTagSuffix(node, options),
            ];
          };
        }
      } else if (node.parent.type === "interpolation") {
        return async (textToDoc) => {
          const textToDocOptions = {
            __isInHtmlInterpolation: true, // to avoid unexpected `}}`
            __embeddedInHtml: true,
          };
          if (options.parser === "angular") {
            textToDocOptions.parser = "__ng_interpolation";
            textToDocOptions.trailingComma = "none";
          } else if (options.parser === "vue") {
            textToDocOptions.parser = isVueSfcWithTypescriptScript(
              path,
              options
            )
              ? "__vue_ts_expression"
              : "__vue_expression";
          } else {
            textToDocOptions.parser = "__js_expression";
          }

          return [
            indent([line, await textToDoc(node.value, textToDocOptions)]),
            node.parent.next &&
            needsToBorrowPrevClosingTagEndMarker(node.parent.next)
              ? " "
              : line,
          ];
        };
      }
      break;

    case "attribute":
      if (!node.value) {
        break;
      }

      // lit-html: html`<my-element obj=${obj}></my-element>`
      if (
        /^PRETTIER_HTML_PLACEHOLDER_\d+_\d+_IN_JS$/.test(
          options.originalText.slice(
            node.valueSpan.start.offset,
            node.valueSpan.end.offset
          )
        )
      ) {
        return [node.rawName, "=", node.value];
      }

      // lwc: html`<my-element data-for={value}></my-element>`
      if (options.parser === "lwc") {
        const interpolationRegex = /^{.*}$/s;
        if (
          interpolationRegex.test(
            options.originalText.slice(
              node.valueSpan.start.offset,
              node.valueSpan.end.offset
            )
          )
        ) {
          return [node.rawName, "=", node.value];
        }
      }

      return async (textToDoc) => {
        const embeddedAttributeValueDoc = await printEmbeddedAttributeValue(
          path,
          (code, opts) =>
            // strictly prefer single quote to avoid unnecessary html entity escape
            textToDoc(code, {
              __isInHtmlAttribute: true,
              __embeddedInHtml: true,
              ...opts,
            }),
          options
        );
        if (embeddedAttributeValueDoc) {
          return [
            node.rawName,
            '="',
            group(
              mapDoc(embeddedAttributeValueDoc, (doc) =>
                typeof doc === "string" ? doc.replaceAll('"', "&quot;") : doc
              )
            ),
            '"',
          ];
        }
      };

    case "front-matter":
      return (textToDoc) => printFrontMatter(node, textToDoc);
  }
}

export default embed;
