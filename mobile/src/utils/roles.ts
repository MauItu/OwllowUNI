/**
 * Roles especiales por correo. Son SOLO informativos en la UI (no otorgan
 * permisos ni cambian comportamiento del backend). El correo se compara en
 * minúsculas porque el backend lo guarda normalizado.
 */
const ROLE_BY_EMAIL: Record<string, string> = {
  'cymslucas4@gmail.com': 'Alpha Tester',
};

/** Devuelve el rol especial del usuario (o null si no tiene). */
export function getUserRole(email: string | null | undefined): string | null {
  if (!email) return null;
  return ROLE_BY_EMAIL[email.trim().toLowerCase()] ?? null;
}
