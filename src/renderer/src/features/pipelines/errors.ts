// Texto de erro para exibir em notas e caixas de erro.
export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e))
