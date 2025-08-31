declare module 'pdf-parse' {
  export default function pdfParse(dataBuffer: Buffer | Uint8Array): Promise<{ text: string; numpages: number; info?: any; metadata?: any; version?: string }>;
}

declare module 'mammoth' {
  export function extractRawText(options: { buffer: Buffer | Uint8Array }): Promise<{ value: string; messages?: any[] }>;
}
