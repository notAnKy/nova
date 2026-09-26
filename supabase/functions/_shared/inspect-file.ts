const textTypes: Record<string, string> = {
  txt: "text/plain", md: "text/markdown", markdown: "text/markdown",
  csv: "text/csv", json: "application/json",
};

export async function inspectFile(file: File): Promise<{ mime: string; bytes: Uint8Array } | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const starts = (...prefix: number[]) => prefix.every((value, index) => bytes[index] === value);
  let mime = "";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) mime = "image/png";
  else if (starts(0xff, 0xd8, 0xff)) mime = "image/jpeg";
  else if (starts(0x47, 0x49, 0x46, 0x38) && [0x37, 0x39].includes(bytes[4]) && bytes[5] === 0x61) mime = "image/gif";
  else if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") mime = "image/webp";
  else {
    const ext = file.name.split(".").at(-1)?.toLowerCase() ?? "";
    mime = textTypes[ext] ?? "";
    if (!mime) return null;
    let contents: string;
    try { contents = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { return null; }
    if (/\u0000|[\u0001-\u0008\u000b\u000c\u000e-\u001f]/u.test(contents)) return null;
    if (mime === "application/json") {
      try { JSON.parse(contents); } catch { return null; }
    }
  }
  const declared = file.type.toLowerCase();
  if (declared && declared !== "application/octet-stream" && declared !== mime &&
    !(mime === "text/markdown" && declared === "text/plain") &&
    !(mime === "text/csv" && declared === "text/plain") &&
    !(mime === "application/json" && declared === "text/plain")) return null;
  return { mime, bytes };
}
