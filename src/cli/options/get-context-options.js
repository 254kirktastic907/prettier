import dashify from "dashify";
import { getSupportInfo } from "../../index.js";
import {
  coreOptions,
  getSupportInfoWithoutPlugins,
} from "../prettier-internal.js";
import { options as cliOptionsMap } from "../constants.evaluate.js";
import { arrayify } from "../utils.js";

const detailedCliOptions = arrayify(cliOptionsMap, "name").map((option) =>
  normalizeDetailedOption(option)
);

function apiOptionToCliOption(apiOption) {
  const cliOption = {
    ...apiOption,
    name: apiOption.cliName || dashify(apiOption.name),
    description: apiOption.cliDescription || apiOption.description,
    category: apiOption.cliCategory || coreOptions.CATEGORY_FORMAT,
    forwardToApi: apiOption.name,
  };

  /* c8 ignore start */
  if (apiOption.deprecated) {
    delete cliOption.forwardToApi;
    delete cliOption.description;
    delete cliOption.oppositeDescription;
    cliOption.deprecated = true;
  }
  /* c8 ignore stop */

  return normalizeDetailedOption(cliOption);
}

function normalizeDetailedOption(option) {
  return {
    category: coreOptions.CATEGORY_OTHER,
    ...option,
    choices: option.choices?.map((choice) => {
      const newChoice = {
        description: "",
        deprecated: false,
        ...(typeof choice === "object" ? choice : { value: choice }),
      };
      /* c8 ignore next 3 */
      if (newChoice.value === true) {
        newChoice.value = ""; // backward compatibility for original boolean option
      }
      return newChoice;
    }),
  };
}

function supportInfoToContextOptions({ options: supportOptions, languages }) {
  const detailedOptions = [
    ...detailedCliOptions,
    ...supportOptions.map((apiOption) => apiOptionToCliOption(apiOption)),
  ];

  return {
    supportOptions,
    languages,
    detailedOptions,
  };
}

async function getContextOptions(plugins, pluginSearchDirs) {
  const supportInfo = await getSupportInfo({
    showDeprecated: true,
    showInternal: true,
    plugins,
    pluginSearchDirs,
  });

  return supportInfoToContextOptions(supportInfo);
}

function getContextOptionsWithoutPlugins() {
  const supportInfo = getSupportInfoWithoutPlugins({ showInternal: true });
  return supportInfoToContextOptions(supportInfo);
}

export { getContextOptions, getContextOptionsWithoutPlugins };
