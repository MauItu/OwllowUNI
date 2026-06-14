/**
 * Parser CSV propio (sin librerías): maneja comillas dobles, comas escapadas
 * (`""` dentro de un campo entrecomillado), saltos de línea CRLF/LF y BOM.
 * Pensado para el round-trip con el export del backend (mismas columnas).
 */

/** Campos normalizados que viajan al backend en POST /api/transactions/import. */
export interface ImportRow {
  date: string;
  time: string;
  type: string;
  amount: string;
  description: string;
  account: string;
  toAccount: string;
  category: string;
  subcategory: string;
  tags: string;
  notes: string;
}

/** Convierte el texto CSV en una matriz de celdas (incluye la fila de cabecera). */
function parseCSV(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // quita BOM

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // se ignora; el \n del par CRLF cierra la fila
    } else {
      field += ch;
    }
  }
  // Última fila si el archivo no termina en salto de línea.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Quita tildes y pasa a minúsculas para reconocer cabeceras de forma tolerante. */
function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[áàä]/g, 'a')
    .replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u');
}

// Cabecera (sin tildes) → clave del objeto ImportRow.
const HEADER_MAP: Record<string, keyof ImportRow> = {
  fecha: 'date',
  hora: 'time',
  tipo: 'type',
  monto: 'amount',
  descripcion: 'description',
  cuenta: 'account',
  'cuenta destino': 'toAccount',
  categoria: 'category',
  subcategoria: 'subcategory',
  etiquetas: 'tags',
  notas: 'notes',
};

function emptyRow(): ImportRow {
  return {
    date: '',
    time: '',
    type: '',
    amount: '',
    description: '',
    account: '',
    toAccount: '',
    category: '',
    subcategory: '',
    tags: '',
    notes: '',
  };
}

/**
 * Parsea un CSV (con cabecera) a filas normalizadas para importar.
 * Las columnas se mapean por nombre de cabecera, así que el orden no importa.
 */
export function csvToImportRows(text: string): ImportRow[] {
  const matrix = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (matrix.length < 2) return [];

  const headerKeys = matrix[0].map((h) => HEADER_MAP[normalizeHeader(h)]);

  return matrix.slice(1).map((cells) => {
    const obj = emptyRow();
    headerKeys.forEach((key, idx) => {
      if (key) obj[key] = (cells[idx] ?? '').trim();
    });
    return obj;
  });
}
