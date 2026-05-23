import { z } from "zod";

const schema = z.object({
  STORAGE_S3_ENDPOINT: z.string().url(),
  STORAGE_S3_REGION: z.string().default("us-east-1"),
  STORAGE_S3_BUCKET: z.string().min(1),
  STORAGE_S3_ACCESS_KEY: z.string().min(1),
  STORAGE_S3_SECRET_KEY: z.string().min(1),
  STORAGE_S3_FORCE_PATH_STYLE: z
    .string()
    .default("false")
    .transform((s) => s === "true" || s === "1"),
});

type Env = z.infer<typeof schema>;

// Parse on first access, not at module load — Next.js build-time page
// collection imports this transitively, and STORAGE_S3_* aren't set in CI.
let _env: Env | null = null;
function load(): Env {
  if (_env) return _env;
  _env = schema.parse(process.env);
  return _env;
}

export const env = new Proxy({} as Env, {
  get(_, prop) {
    return load()[prop as keyof Env];
  },
}) as Env;
