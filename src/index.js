import vnopts from "vnopts";
import fastGlob from "fast-glob";
import * as core from "./main/core.js";
import { getSupportInfo as getSupportInfoWithoutPlugins } from "./main/support.js";
import getFileInfoWithoutPlugins from "./common/get-file-info.js";
import {
  loadBuiltinPlugins,
  loadPlugins,
  searchPlugins,
  clearCache as clearPluginCache,
} from "./main/plugins/index.js";
import {
  resolveConfig,
  resolveConfigFile,
  clearCache as clearConfigCache,
} from "./config/resolve-config.js";
import * as errors from "./common/errors.js";
import * as coreOptions from "./main/core-options.evaluate.js";
import { createIsIgnoredFunction } from "./utils/ignore.js";
import { formatOptionsHiddenDefaults } from "./main/normalize-format-options.js";
import normalizeOptions from "./main/normalize-options.js";
import arrayify from "./utils/arrayify.js";
import partition from "./utils/partition.js";
import isNonEmptyArray from "./utils/is-non-empty-array.js";

/**
 * @param {*} fn
 * @param {number} [optionsArgumentIndex]
 * @returns {*}
 */
function withPlugins(
  fn,
  optionsArgumentIndex = 1 // Usually `options` is the 2nd argument
) {
  return async (...args) => {
    const options = args[optionsArgumentIndex] ?? {};
    const { plugins = [], pluginSearchDirs } = options;

    args[optionsArgumentIndex] = {
      ...options,
      plugins: (
        await Promise.all([
          loadBuiltinPlugins(),
          // TODO: standalone version allow `plugins` to be `prettierPlugins` which is an object, should allow that too
          loadPlugins(plugins),
          options.pluginSearchDirs === false
            ? []
            : searchPlugins(pluginSearchDirs),
        ])
      ).flat(),
    };

    return fn(...args);
  };
}

const formatWithCursor = withPlugins(core.formatWithCursor);

async function format(text, options) {
  const { formatted } = await formatWithCursor(text, {
    ...options,
    cursorOffset: -1,
  });
  return formatted;
}

async function check(text, options) {
  return (await format(text, options)) === text;
}

// eslint-disable-next-line require-await
async function clearCache() {
  clearConfigCache();
  clearPluginCache();
}

/** @type {typeof getFileInfoWithoutPlugins} */
const getFileInfo = withPlugins(getFileInfoWithoutPlugins);

/** @type {typeof getSupportInfoWithoutPlugins} */
const getSupportInfo = withPlugins(getSupportInfoWithoutPlugins, 0);

// Internal shared with cli
const sharedWithCli = {
  errors,
  coreOptions,
  createIsIgnoredFunction,
  formatOptionsHiddenDefaults,
  normalizeOptions,
  getSupportInfoWithoutPlugins,
  vnopts,
  fastGlob,
  utils: {
    arrayify,
    isNonEmptyArray,
    partition,
  },
};

const debugApis = {
  parse: withPlugins(core.parse),
  formatAST: withPlugins(core.formatAst),
  formatDoc: withPlugins(core.formatDoc),
  printToDoc: withPlugins(core.printToDoc),
  printDocToString: withPlugins(core.printDocToString),
};

export {
  formatWithCursor,
  format,
  check,
  resolveConfig,
  resolveConfigFile,
  clearCache as clearConfigCache,
  getFileInfo,
  getSupportInfo,
  sharedWithCli as __internal,
  debugApis as __debug,
};
export * as util from "./utils/public.js";
export * as doc from "./document/public.js";
export { default as version } from "./main/version.evaluate.cjs";
