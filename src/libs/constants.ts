export const BASE_URL = __DEV__
  ? "http://localhost:4321"
  : "https://vigogh.com";

export const STATIC_BASE_URL = __DEV__
  ? "http://localhost:4322"
  : "https://vigogh.com";

export const API_BASE_URL = __DEV__
  ? "http://localhost:3000"
  : "https://api.vigogh.com";

export const SIDEPANEL_URL = `${BASE_URL}/sidepanel`;

export const ALLOWED_EXTERNAL_MESSAGE_ORIGINS = [
  "https://vigogh.com",
  "http://localhost:4321",
];
