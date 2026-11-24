import config from "@/data/app-config.json";

export interface AppConfig {
  id: string;
  familyName: string;
  appName: string;
  basePath: string;
  iconLabel: string;
  accent: string;
}

export const APP_CONFIG = config as AppConfig;
export const databaseNameFor = (appId: string) => `atlas-${appId}-v4`;
export const viewportKeyFor = (appId: string) => `atlas-${appId}-viewport-v1`;
export const cachePrefixFor = (appId: string) => `atlas-cache-${appId}-`;