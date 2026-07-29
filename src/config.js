/** Build-time constants. */

/* global __APP_VERSION__ */
export const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

/** Shown in Settings. Change the owner if you fork this. */
export const REPO_URL = 'https://github.com/drewalfano/macro-tracker-app'
