import { devConfig } from './dev';
import { stagingConfig } from './staging';
import { productionConfig } from './production';
import { EnvironmentConfig } from './types';

/**
 * Get environment configuration based on the environment name
 * @param environment - The environment name (dev, staging, production)
 * @returns The environment configuration
 */
export function getConfig(environment: string): EnvironmentConfig {
  switch (environment) {
    case 'dev':
      return devConfig;
    case 'staging':
      return stagingConfig;
    case 'production':
      return productionConfig;
    default:
      console.warn(`Unknown environment: ${environment}, defaulting to dev`);
      return devConfig;
  }
}

export { EnvironmentConfig } from './types';
export { devConfig, stagingConfig, productionConfig };
