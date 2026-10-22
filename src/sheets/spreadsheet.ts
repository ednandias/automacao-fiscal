import fs from "node:fs";
import path from "node:path";
import * as xlsx from "xlsx";

xlsx.set_fs(fs);

export interface SheetRow {
  //? linha real no Excel (1 = cabeçalho)
  row: number;
  NFE: string;
  NFE_DEV: string;
}

export interface Spreadsheet {
  rows: SheetRow[];
  //? grava um valor na coluna NFE_DEV da linha e salva o arquivo
  write: (row: number, value: string) => void;
}

const DEFAULT_SHEET = "Sheet1";

export function openSpreadsheet(pathFile: string): Spreadsheet {
  const workbook = xlsx.readFile(pathFile);
  const worksheet = firstSheet(workbook);

  if (!worksheet) throw new Error("A planilha não tem nenhuma aba.");

  //? sem o cabeçalho NFE_DEV toda nota pareceria pendente e seria emitida de novo
  for (const header of ["NFE", "NFE_DEV"]) {
    if (!findColumn(worksheet, header)) {
      throw new Error(
        `Cabeçalho "${header}" não encontrado na primeira linha.`,
      );
    }
  }

  const column = findColumn(worksheet, "NFE_DEV")!;

  return {
    rows: readRows(worksheet),
    write(row, value) {
      //? sheet_add_aoa também expande o !ref; escrever a célula direto fora
      //? do intervalo faz o valor sumir ao salvar
      xlsx.utils.sheet_add_aoa(worksheet, [[value]], {
        origin: `${column}${row}`,
      });
      save(workbook, pathFile);
    },
  };
}

//? acrescenta notas novas (ignorando as que já existem) e cria o arquivo se preciso
export function appendNotes(pathFile: string, notes: string[]) {
  const workbook = fs.existsSync(pathFile)
    ? xlsx.readFile(pathFile)
    : xlsx.utils.book_new();

  const sheetName = workbook.SheetNames[0] ?? DEFAULT_SHEET;
  const existing = workbook.Sheets[sheetName]
    ? xlsx.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[sheetName],
      )
    : [];

  const known = new Set(existing.map((r) => String(r.NFE ?? "").trim()));
  const added = [...new Set(notes)].filter((n) => !known.has(n));

  const worksheet = xlsx.utils.json_to_sheet([
    ...existing,
    ...added.map((NFE) => ({ NFE, NFE_DEV: "" })),
  ]);

  if (!workbook.Sheets[sheetName]) workbook.SheetNames.push(sheetName);
  workbook.Sheets[sheetName] = worksheet;

  fs.mkdirSync(path.dirname(pathFile), { recursive: true });
  save(workbook, pathFile);

  return added.length;
}

//? Excel cria "~$arquivo.xlsx" e LibreOffice ".~lock.arquivo.xlsx#" enquanto a planilha está aberta
export function isOpenElsewhere(pathFile: string) {
  const dir = path.dirname(pathFile);
  const base = path.basename(pathFile);

  return [`.~lock.${base}#`, `~$${base}`, `~$${base.slice(2)}`].some((f) =>
    fs.existsSync(path.join(dir, f)),
  );
}

//? só .xlsx, sem os arquivos de trava/temporários do Excel e LibreOffice
export function isSpreadsheetFile(filename: string) {
  return /\.xls(x|m)$/i.test(filename) && !/^(~\$|\.)/.test(filename);
}

function firstSheet(workbook: xlsx.WorkBook) {
  const name = workbook.SheetNames[0];

  return name ? workbook.Sheets[name] : undefined;
}

function readRows(worksheet: xlsx.WorkSheet): SheetRow[] {
  const raw = xlsx.utils.sheet_to_json<
    Record<string, unknown> & { __rowNum__: number }
  >(worksheet, { defval: null });

  return raw.flatMap((r) => {
    const NFE = String(r.NFE ?? "").trim();
    if (!NFE) return [];

    //? __rowNum__ é a linha real (0-based) mesmo com linhas em branco no meio
    return [
      { row: r.__rowNum__ + 1, NFE, NFE_DEV: String(r.NFE_DEV ?? "").trim() },
    ];
  });
}

//? letra da coluna cujo cabeçalho é `header` (ex.: "NFE_DEV" -> "B")
function findColumn(worksheet: xlsx.WorkSheet, header: string) {
  if (!worksheet["!ref"]) return undefined;

  const range = xlsx.utils.decode_range(worksheet["!ref"]);

  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = worksheet[xlsx.utils.encode_cell({ r: range.s.r, c })];

    if (
      String(cell?.v ?? "")
        .trim()
        .toUpperCase() === header
    ) {
      return xlsx.utils.encode_col(c);
    }
  }
}

//? grava num arquivo temporário e renomeia: se o processo cair no meio da
//? escrita, a planilha original continua íntegra
function save(workbook: xlsx.WorkBook, pathFile: string) {
  const tmp = path.join(
    path.dirname(pathFile),
    `.${path.basename(pathFile)}.tmp`,
  );

  fs.writeFileSync(
    tmp,
    xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }),
  );
  fs.renameSync(tmp, pathFile);
}
