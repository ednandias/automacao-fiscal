import * as xlsx from "xlsx";
import * as fs from "node:fs";

xlsx.set_fs(fs);

export { xlsx };
