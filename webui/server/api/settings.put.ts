import { saveSettings, validateSettings } from '../services/settings.service';

// Enregistre les réglages de la WebUI (validés : URL http(s), nom de modèle, bornes des options)
export default defineEventHandler(async (event) => {
  const settings = validateSettings(await readBody(event));
  saveSettings(settings);
  return { settings };
});
