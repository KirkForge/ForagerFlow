/**
 * Custom ESLint rule: discourage raw UI strings outside the i18n system.
 *
 * Targets the most common places where user-visible text can leak into the
 * codebase without going through `t()`:
 *
 * - textContent / innerHTML assignments
 * - createEl(tag, className, "visible text")
 * - setAttribute("aria-label", "visible text") and similar
 *
 * This is a *warning* rule. Intentional one-off strings (e.g. "×") can be
 * disabled inline with `// eslint-disable-next-line no-raw-ui-strings`.
 */

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Raw UI strings should use the i18n `t()` helper so Danish-first copy stays consistent.",
      recommended: false,
    },
    schema: [],
    messages: {
      rawUiString:
        "Raw UI string '{{text}}' should be moved to i18n messages and loaded via t().",
    },
  },

  create(context) {
    /**
     * @param {import("estree").Literal} node
     * @param {string} [allowed]
     */
    function checkRawString(node, allowed) {
      if (
        node.type !== "Literal" ||
        typeof node.value !== "string" ||
        node.value.length === 0
      ) {
        return;
      }
      const text = node.value;
      // Ignore whitespace-only strings and single typographic characters.
      if (/^\s*$/.test(text) || /^[^A-Za-z0-9]+$/.test(text)) {
        return;
      }
      if (allowed && text === allowed) {
        return;
      }
      context.report({
        node,
        messageId: "rawUiString",
        data: { text: text.slice(0, 40) },
      });
    }

    return {
      // textContent = "..." and innerHTML = "..."
      'AssignmentExpression[left.type="MemberExpression"]'(node) {
        const prop = node.left.property;
        if (
          node.left.object.type !== "Super" &&
          prop.type === "Identifier" &&
          (prop.name === "textContent" || prop.name === "innerHTML") &&
          node.left.computed === false
        ) {
          checkRawString(node.right);
        }
      },

      // createEl(tag, className?, "text")
      'CallExpression[callee.name="createEl"]'(node) {
        const textArg = node.arguments[2];
        if (textArg) {
          checkRawString(textArg);
        }
      },

      // setAttribute("aria-label", "...") and similar visible attributes.
      'CallExpression[callee.type="MemberExpression"]'(node) {
        const callee = node.callee;
        if (
          callee.property.type !== "Identifier" ||
          callee.property.name !== "setAttribute"
        ) {
          return;
        }
        const attrArg = node.arguments[0];
        const valueArg = node.arguments[1];
        if (
          attrArg?.type !== "Literal" ||
          typeof attrArg.value !== "string" ||
          !valueArg
        ) {
          return;
        }
        const attr = attrArg.value.toLowerCase();
        if (
          attr === "aria-label" ||
          attr === "title" ||
          attr === "placeholder" ||
          attr === "alt"
        ) {
          checkRawString(valueArg);
        }
      },
    };
  },
};
