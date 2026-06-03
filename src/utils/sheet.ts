import { xlsx } from "../services/xlsx.js";

interface InsertOnCellProps {
  workbook: xlsx.WorkBook;
  worksheet: xlsx.WorkSheet;
  pathFile: string;
  cellNfeDev: string;
  originalIndex: number;
  value: string;
}

export function insertOnCell({
  workbook,
  worksheet,
  pathFile,
  originalIndex,
  cellNfeDev,
  value,
}: InsertOnCellProps) {
  //? linha no excel = índice + 2 (1 do header, 1 do 0-based do array)
  const row = originalIndex + 2;

  //? escreve direto na célula E{row} (coluna NFE_DEV)
  worksheet[`${cellNfeDev}${row}`] = { v: value, t: "s" };

  //? salva preservando tudo que já estava
  xlsx.writeFile(workbook, pathFile);
}
