import { listExistingGguf } from '../../services/import.service';

export default defineEventHandler(async () => {
  const files = await listExistingGguf();
  return { files };
});
