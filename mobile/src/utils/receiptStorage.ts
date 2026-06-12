/**
 * Almacenamiento LOCAL de fotos de recibos (decisión A): las imágenes viven en
 * el dispositivo, en `documentDirectory/receipts/`, y en la DB solo se guarda el
 * nombre del archivo (`transactions.receipt_filename`). NO se suben al backend.
 * Contra conocido: no sincroniza entre dispositivos (la app es single-device).
 *
 * Centraliza: construir rutas, comprimir+guardar, comprobar existencia y borrar.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';

const RECEIPTS_DIR = (FileSystem.documentDirectory ?? '') + 'receipts/';
const MAX_WIDTH = 1280;
const QUALITY = 0.7;

/** Ruta absoluta (file://) de un recibo a partir de su nombre de archivo. */
export function receiptUri(filename: string): string {
  return RECEIPTS_DIR + filename;
}

/** Crea el directorio de recibos si no existe. */
async function ensureDir(): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  const info = await FileSystem.getInfoAsync(RECEIPTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(RECEIPTS_DIR, { intermediates: true });
  }
}

/** ¿Existe el archivo en disco? (false si falta el nombre o el directorio). */
export async function receiptExists(filename?: string | null): Promise<boolean> {
  if (!filename || !FileSystem.documentDirectory) return false;
  try {
    const info = await FileSystem.getInfoAsync(receiptUri(filename));
    return info.exists;
  } catch {
    return false;
  }
}

/**
 * Comprime/redimensiona una imagen (máx 1280px de ancho, JPEG calidad 0.7) y la
 * mueve a `receipts/{uuid}.jpg`. Devuelve el nombre del archivo guardado.
 * Solo redimensiona si la imagen excede el ancho máximo (no la amplía).
 */
export async function processAndSaveReceipt(sourceUri: string, sourceWidth?: number): Promise<string> {
  await ensureDir();

  const ctx = ImageManipulator.manipulate(sourceUri);
  if (!sourceWidth || sourceWidth > MAX_WIDTH) ctx.resize({ width: MAX_WIDTH });
  const ref = await ctx.renderAsync();
  const result = await ref.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });

  const filename = `${Crypto.randomUUID()}.jpg`;
  await FileSystem.moveAsync({ from: result.uri, to: receiptUri(filename) });
  return filename;
}

/** Borra el archivo del recibo (idempotente; ignora si no existe). */
export async function deleteReceipt(filename?: string | null): Promise<void> {
  if (!filename || !FileSystem.documentDirectory) return;
  try {
    await FileSystem.deleteAsync(receiptUri(filename), { idempotent: true });
  } catch (err) {
    console.warn('[receiptStorage] no se pudo borrar', filename, err);
  }
}
