import { z } from 'zod'

export const upsertRecordSchema = z.object({
  // Conteúdo clínico — criptografado em repouso; NUNCA em logs/audit
  content: z.string().max(100_000).optional(),
  estadoEmocional: z.coerce.number().int().min(1).max(10).optional(),
  temas: z.array(z.string().trim().max(255)).max(50).optional(),
  tarefas: z.string().max(10_000).optional(),
  legalHold: z.boolean().optional(),
})

export type UpsertRecordInput = z.infer<typeof upsertRecordSchema>
