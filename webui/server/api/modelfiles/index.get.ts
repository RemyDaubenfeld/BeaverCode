import { listModelfiles } from '../../services/modelfile.service';

export default defineEventHandler(async () => {
  const files = await listModelfiles();
  return { files };
});
