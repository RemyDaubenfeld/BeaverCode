import { readFile, readdir } from 'node:fs/promises';

// Profil d'alimentation de la machine (Linux, sysfs) : il change les vitesses mesurées par le benchmark.
// Mesuré le 23/11 (qwen3-coder:30b-a3b, mêmes réglages) : 8,1 tok/s en `low-power`, 10,5 en `performance`.
// Même lecture que power_state() dans benchmark.py, qui l'enregistre avec chaque test.
// null = information indisponible (pas de platform_profile : machine de bureau, autre OS…).

async function readText(path: string): Promise<string | null> {
  try {
    return (await readFile(path, 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

export default defineEventHandler(async () => {
  const profile = await readText('/sys/firmware/acpi/platform_profile');
  const choices = (await readText('/sys/firmware/acpi/platform_profile_choices'))?.split(/\s+/) ?? [];

  let onAc: boolean | null = null;
  try {
    for (const name of await readdir('/sys/class/power_supply')) {
      if ((await readText(`/sys/class/power_supply/${name}/type`)) !== 'Mains') continue;
      onAc = (await readText(`/sys/class/power_supply/${name}/online`)) === '1';
      break;
    }
  } catch {
    // pas de /sys/class/power_supply : onAc reste inconnu
  }

  return { profile, choices, on_ac: onAc };
});
