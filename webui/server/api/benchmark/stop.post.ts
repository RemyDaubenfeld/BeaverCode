import { stopBenchmark } from '../../services/benchmark.service';

// Arrête le benchmark en cours, qu'il ait été lancé par cette page ou avant un rechargement
// (bouton « Annuler » du run, ou « Arrêter le benchmark en cours » après un refus 409)
export default defineEventHandler(async () => {
  return { stopped: await stopBenchmark() };
});
