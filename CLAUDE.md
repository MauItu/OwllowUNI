## Pagos recurrentes
- La materialización DEBE ser idempotente. Llamar N veces = mismo resultado.
- Usar transacciones de DB para atomicidad.
- node-cron para el scheduler del servidor.
- Los registros auto-generados se marcan con recurring_rule_id, NUNCA borrar ese vínculo.
- Cuota de manejo es un caso especial de regla recurrente, no un sistema aparte.
- Congelar tarjeta ≠ desactivar cuenta. Congelada permite pagos de deuda, desactivada no aparece en selectores.

