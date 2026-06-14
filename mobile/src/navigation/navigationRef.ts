import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

/**
 * Ref global al NavigationContainer. Permite navegar desde componentes que
 * viven FUERA del árbol de navegación (p. ej. el `Sidebar`, renderizado como
 * overlay en `App.tsx`). Se adjunta en `<NavigationContainer ref={navigationRef}>`.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate<Name extends keyof RootStackParamList>(
  name: Name,
  params?: RootStackParamList[Name],
) {
  if (navigationRef.isReady()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigationRef.navigate(name as any, params as any);
  }
}
