---
name: wallet-status
description: Muestra el estado actual del proyecto wallet
---

Ejecuta en orden y muéstrame un resumen compacto:
1. `git log --oneline -5` (últimos 5 commits)
2. `git status --short` (archivos pendientes)
3. `pnpm tsc --noEmit 2>&1 | tail -5` (errores de tipos)
4. Muestra las tablas de Drizzle que existen actualmente (lee el schema)
