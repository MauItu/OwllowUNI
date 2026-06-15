---
name: commit-fase
description: Hace commit y push de una fase completada con mensaje estandarizado
---

Ejecuta estos pasos en orden:
1. `git add -A`
2. `git diff --cached --stat` (muéstrame qué archivos cambiaron)
3. Pídeme confirmar el mensaje de commit
4. `git commit -m "[mensaje]"`
5. `git push origin`
6. Confirma que el push fue exitoso
