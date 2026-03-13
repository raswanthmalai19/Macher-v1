"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productionConfig = exports.stagingConfig = exports.devConfig = void 0;
exports.getConfig = getConfig;
const dev_1 = require("./dev");
Object.defineProperty(exports, "devConfig", { enumerable: true, get: function () { return dev_1.devConfig; } });
const staging_1 = require("./staging");
Object.defineProperty(exports, "stagingConfig", { enumerable: true, get: function () { return staging_1.stagingConfig; } });
const production_1 = require("./production");
Object.defineProperty(exports, "productionConfig", { enumerable: true, get: function () { return production_1.productionConfig; } });
/**
 * Get environment configuration based on the environment name
 * @param environment - The environment name (dev, staging, production)
 * @returns The environment configuration
 */
function getConfig(environment) {
    switch (environment) {
        case 'dev':
            return dev_1.devConfig;
        case 'staging':
            return staging_1.stagingConfig;
        case 'production':
            return production_1.productionConfig;
        default:
            console.warn(`Unknown environment: ${environment}, defaulting to dev`);
            return dev_1.devConfig;
    }
}
//# sourceMappingURL=index.js.map