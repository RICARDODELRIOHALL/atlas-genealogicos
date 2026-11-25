const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Convierte fechas GEDCOM y fechas habituales a una lectura clara en español. */
export function formatGenealogyDate(value?: string): string {
  const raw = (value ?? "").trim();
  if (!raw || raw === ".") return "";

  const gedcom = raw.match(/([+-]?\d{4})(\d{2})(\d{2})/);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  const date = gedcom ?? iso ?? compact;
  if (date) {
    const year = (date[1] ?? "").replace(/^\+/, "");
    const month = Number(date[2] ?? 0);
    const day = Number(date[3] ?? 0);
    const prefix = /\b(abt|about|circa|ca\.?|aprox|aproximadamente)\b/i.test(raw) ? "aproximadamente " : "";
    if (!month || month > 12) return `${prefix}${year}`;
    const monthName = MONTHS[month - 1] ?? "";
    if (!day || day > 31) return `${prefix}${monthName} de ${year}`;
    return `${prefix}${day} de ${monthName} de ${year}`;
  }

  const conventional = raw.match(/^(\d{1,2})[\s./-]+([A-Za-zÁÉÍÓÚáéíóú]+)[\s,./-]+(\d{3,4})$/);
  if (conventional) {
    const monthText = conventional[2] ?? "";
    const monthIndex = MONTHS.findIndex((month) => month.startsWith(monthText.toLocaleLowerCase("es")));
    if (monthIndex >= 0) return `${Number(conventional[1])} de ${MONTHS[monthIndex] ?? monthText} de ${conventional[3] ?? ""}`;
  }
  return raw;
}

